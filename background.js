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

    function normalisePotentialUrl(value) {
        if (!value) {
            return null;
        }

        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return null;
        }

        const javascriptMatch = trimmedValue.match(/^javascript:\s*(.*)$/i);
        const workingValue = javascriptMatch ? javascriptMatch[1] : trimmedValue;

        const potentialValues = [];
        const quotedValueRegex = /['"]([^'"]+)['"]/g;
        let match;
        while ((match = quotedValueRegex.exec(workingValue)) !== null) {
            potentialValues.push(match[1]);
        }

        potentialValues.push(workingValue);

        for (const potentialValue of potentialValues) {
            const candidate = potentialValue.trim();
            if (!candidate || /^javascript:/i.test(candidate)) {
                continue;
            }

            try {
                return new URL(candidate, window.location.origin).href;
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    function extractUrlFromAnchor(anchor) {
        if (!anchor) {
            return null;
        }

        const dataAttributeCandidates = ['data-url', 'data-href', 'data-target', 'data-label-url'];
        for (const attribute of dataAttributeCandidates) {
            const value = anchor.getAttribute(attribute);
            const normalised = normalisePotentialUrl(value);
            if (normalised) {
                return normalised;
            }
        }

        const hrefValue = anchor.getAttribute('href');
        const normalisedHref = normalisePotentialUrl(hrefValue);
        if (normalisedHref) {
            return normalisedHref;
        }

        const onclickValue = anchor.getAttribute('onclick');
        const normalisedOnclick = normalisePotentialUrl(onclickValue);
        if (normalisedOnclick) {
            return normalisedOnclick;
        }

        return null;
    }

    try {
        if (document.readyState !== 'complete') {
            await waitForCondition(() => document.readyState === 'complete');
        }

        const demoLabelLink = await waitForCondition(findDemoLabelLink);
        const labelURL = extractUrlFromAnchor(demoLabelLink);

        if (labelURL) {
            window.open(labelURL, '_blank', 'noopener');
            return;
        }

        demoLabelLink.click();
        console.warn(`[Demo Automation] Falling back to clicking the demo label link for order ID ${orderID}.`);
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

async function inspectDemoOrder(orderID) {
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

    function normaliseOrderNumber(rawValue) {
        if (!rawValue) {
            return null;
        }

        const trimmed = rawValue.trim();
        if (!trimmed) {
            return null;
        }

        const digitsOnly = trimmed.replace(/\D+/g, '');
        return digitsOnly || null;
    }

    function findDemoOrderAnchor() {
        const anchors = Array.from(document.querySelectorAll('td a[href]'));

        return anchors.find((anchor) => {
            const href = anchor.getAttribute('href') || '';
            const text = anchor.textContent || '';
            const normalisedText = normaliseOrderNumber(text);

            if (normalisedText) {
                return /my_inventory\.cfm/i.test(href) || /\biorder=\d+/i.test(href);
            }

            const hrefMatch = href.match(/\biorder=(\d+)/i);
            return Boolean(hrefMatch);
        }) || null;
    }

    function extractOrderNumberFromAnchor(anchor) {
        if (!anchor) {
            return null;
        }

        const textNumber = normaliseOrderNumber(anchor.textContent || '');
        if (textNumber) {
            return textNumber;
        }

        const href = anchor.getAttribute('href') || '';
        const match = href.match(/\biorder=(\d+)/i);
        return match ? match[1] : null;
    }

    function findCorrespondingRow(orderNumber) {
        if (!orderNumber) {
            return null;
        }

        const attributeSelector = `div.row.rwOrdr[onclick*="GetOrder(${orderNumber}"]`;
        const directMatch = document.querySelector(attributeSelector);
        if (directMatch) {
            return directMatch;
        }

        const fallbackMatch = Array.from(document.querySelectorAll('div.row.rwOrdr')).find((row) => {
            const rowText = row.textContent || '';
            return rowText.includes(`#${orderNumber}`);
        });

        return fallbackMatch || null;
    }

    try {
        if (document.readyState !== 'complete') {
            await waitForCondition(() => document.readyState === 'complete');
        }

        const demoOrderAnchor = await waitForCondition(findDemoOrderAnchor);
        const demoOrderNumber = extractOrderNumberFromAnchor(demoOrderAnchor);

        if (!demoOrderNumber) {
            console.warn(`[Demo Automation] Unable to determine demo order number for Order #${orderID}.`);
            return;
        }

        console.log(`[Demo Automation] Found demo order number ${demoOrderNumber} for Order #${orderID}.`);

        const targetRow = await waitForCondition(() => findCorrespondingRow(demoOrderNumber), { timeout: 15000 });

        if (!targetRow) {
            console.warn(`[Demo Automation] Unable to locate row for demo order #${demoOrderNumber}.`);
            return;
        }

        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

        if (typeof targetRow.click === 'function') {
            targetRow.click();
            console.log(`[Demo Automation] Clicked row for demo order #${demoOrderNumber}.`);
        } else {
            console.warn(`[Demo Automation] Located row for demo order #${demoOrderNumber} but could not trigger click.`);
        }
    } catch (error) {
        console.error(`[Demo Automation] Failed to inspect demo order for Order #${orderID}: ${error.message}`);
    }
}

// Reset tabOpenedRecently after the tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (managedTabs.has(tabId)) {
        managedTabs.delete(tabId);
        releaseTabCreationLock();
    }
});
