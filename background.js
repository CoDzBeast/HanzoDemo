let tabOpenedRecently = false;
let unlockTimer = null;
const managedTabs = new Set();
let extensionEnabled = true; // Default state
const DEMO_LABELS_STORAGE_KEY = 'demoLabelsQueue';

// Get extensionEnabled state from storage
chrome.storage.local.get(['extensionEnabled'], function(result) {
    if (result.extensionEnabled !== undefined) {
        extensionEnabled = result.extensionEnabled;
    }
});

function lockTabCreation() {
    tabOpenedRecently = true;
    if (unlockTimer) {
        clearTimeout(unlockTimer);
    }

    unlockTimer = setTimeout(() => {
        tabOpenedRecently = false;
        unlockTimer = null;
    }, 15000);
}

function releaseTabCreationLock() {
    tabOpenedRecently = false;
    if (unlockTimer) {
        clearTimeout(unlockTimer);
        unlockTimer = null;
    }
}

function openAccountTab(orderID, injectedFunction) {
    const accountPageUrl = `https://www.hattorihanzoshears.com/cgi-bin/AccountInfo.cfm?iOrder=${orderID}`;

    lockTabCreation();

    chrome.tabs.create({ url: accountPageUrl, active: true }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
            console.error(`Failed to open account page for order ${orderID}:`, chrome.runtime.lastError);
            releaseTabCreationLock();
            return;
        }

        managedTabs.add(tab.id);

        const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);

                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: injectedFunction,
                    args: [orderID]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error(`Failed to run automation for order ${orderID}:`, chrome.runtime.lastError);
                    }
                    managedTabs.delete(tab.id);
                    releaseTabCreationLock();
                });
            }
        };

        chrome.tabs.onUpdated.addListener(listener);
    });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleExtension") {
        extensionEnabled = request.extensionEnabled;
        chrome.storage.local.set({ 'extensionEnabled': extensionEnabled });
    }

    if (request.action === "printDemoLabel" && request.orderID) {
        openAccountTab(request.orderID, openReturnLabel);
        removeQueuedDemoLabel(request.orderID);
        if (typeof sendResponse === 'function') {
            sendResponse({ success: true });
        }
        return;
    }

    if (!extensionEnabled) {
        return;
    }

    if (request.action === "processOrder" && !tabOpenedRecently && request.orderID) {
        openAccountTab(request.orderID, openReturnLabel);
    }

    if (request.action === "inspectDemoOrder" && request.orderID) {
        openAccountTab(request.orderID, inspectDemoOrder);
    }
});

// This function will be injected into the new tab to open the return label
async function openReturnLabel(orderID) {
    function waitForCondition(conditionFn, { timeout = 20000, interval = 250 } = {}) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkCondition = () => {
                try {
                    const result = conditionFn();
                    if (result) {
                        resolve(result);
                        return;
                    }
                } catch (error) {
                    reject(error);
                    return;
                }

                if (Date.now() - startTime >= timeout) {
                    reject(new Error('Timed out waiting for condition.'));
                    return;
                }

                setTimeout(checkCondition, interval);
            };

            checkCondition();
        });
    }

    function findDemoLabelLink() {
        const rows = Array.from(document.querySelectorAll('#TItems tr'));

        for (const row of rows) {
            const rowText = row.textContent || '';
            if (!rowText.toLowerCase().includes('demo')) {
                continue;
            }

            const matchingAnchor = Array.from(row.querySelectorAll('a')).find((anchor) => {
                return (anchor.textContent || '').trim().toLowerCase() === 'view demo label';
            });

            if (matchingAnchor) {
                return matchingAnchor;
            }
        }

        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors.find((anchor) => (anchor.textContent || '').trim().toLowerCase() === 'view demo label') || null;
    }

    try {
        if (document.readyState !== 'complete') {
            await waitForCondition(() => document.readyState === 'complete');
        }

        const demoLabelLink = await waitForCondition(findDemoLabelLink);
        demoLabelLink.click();

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const labelURL = demoLabelLink.href;
        if (labelURL && labelURL !== 'javascript:') {
            window.open(labelURL, '_blank');
        } else {
            console.error(`[Demo Automation] Demo label URL not found for order ID ${orderID}.`);
        }
    } catch (error) {
        console.error(`[Demo Automation] Unable to open demo label for order ID ${orderID}: ${error.message}`);
    }
}

function removeQueuedDemoLabel(orderID) {
    chrome.storage.local.get([DEMO_LABELS_STORAGE_KEY], (result) => {
        const queue = Array.isArray(result[DEMO_LABELS_STORAGE_KEY]) ? result[DEMO_LABELS_STORAGE_KEY] : [];
        const filteredQueue = queue.filter((entry) => entry.orderNumber !== orderID);

        if (filteredQueue.length === queue.length) {
            return;
        }

        chrome.storage.local.set({ [DEMO_LABELS_STORAGE_KEY]: filteredQueue }, () => {
            if (chrome.runtime.lastError) {
                console.error('[Demo Automation] Failed to update demo label queue:', chrome.runtime.lastError);
            }
        });
    });
}

function inspectDemoOrder(orderID) {
    const dateElement = document.querySelector('#dOrd1');
    if (dateElement) {
        const primaryOrderDate = dateElement.textContent.trim();
        console.log(`[Demo Automation] Order #${orderID} primary order date: ${primaryOrderDate}`);
    } else {
        console.warn(`[Demo Automation] Could not find primary order date for Order #${orderID}.`);
    }

    const rows = document.querySelectorAll('div.row');
    console.log(`[Demo Automation] Inspecting ${rows.length} rows for Order #${orderID}.`);
    rows.forEach((row, index) => {
        console.log(`[Demo Automation] Row ${index + 1}:`, row.outerHTML);
    });
}

// Reset tabOpenedRecently after the tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (managedTabs.has(tabId)) {
        managedTabs.delete(tabId);
        releaseTabCreationLock();
    }
});
