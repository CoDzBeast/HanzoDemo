let tabOpenedRecently = false;
let unlockTimer = null;
const managedTabs = new Set();
let extensionEnabled = true; // Default state
const DEMO_LABELS_STORAGE_KEY = 'demoLabelsQueue';
const DEMO_ORDER_STORAGE_KEY = 'demoOrderNumber';
let demoOrderNumber = null;

// Get extensionEnabled state from storage
chrome.storage.local.get(['extensionEnabled', DEMO_ORDER_STORAGE_KEY], function(result) {
    if (result.extensionEnabled !== undefined) {
        extensionEnabled = result.extensionEnabled;
    }

    if (result[DEMO_ORDER_STORAGE_KEY]) {
        demoOrderNumber = result[DEMO_ORDER_STORAGE_KEY];
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
    if (request.action === 'storeDemoOrderNumber' && request.orderNumber) {
        demoOrderNumber = request.orderNumber;
        chrome.storage.local.set({ [DEMO_ORDER_STORAGE_KEY]: demoOrderNumber });
        if (typeof sendResponse === 'function') {
            sendResponse({ success: true });
        }
        return;
    }

    if (request.action === 'getDemoOrderNumber') {
        if (typeof sendResponse === 'function') {
            sendResponse({ orderNumber: demoOrderNumber });
        }
        return;
    }

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

    function isAccountInfoPage() {
        return /\/AccountInfo\.cfm/i.test(window.location.href);
    }

    function findDemoOrderRow() {
        const table = document.querySelector('table.table.table-striped');

        if (!table) {
            return null;
        }

        const rows = Array.from(table.querySelectorAll('tr'));

        for (const row of rows) {
            const demoCell = Array.from(row.querySelectorAll('td')).find((cell) => {
                const align = (cell.getAttribute('align') || '').toLowerCase();
                const text = (cell.textContent || '').trim();
                return align === 'center' && text === 'O';
            });

            if (!demoCell) {
                continue;
            }

            const orderAnchor = row.querySelector('a[href*="iorder="]');

            if (orderAnchor) {
                return { row, orderAnchor };
            }
        }

        return null;
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

    function findViewDemoLabelLink() {
        const anchors = Array.from(document.querySelectorAll('a'));

        return anchors.find((anchor) => {
            const text = (anchor.textContent || '').trim().toLowerCase();
            const onclick = anchor.getAttribute('onclick') || '';
            return text === 'view demo label' || /viewdemo\s*label\s*\(\s*\)/i.test(onclick) || /viewDemoLabel\s*\(/i.test(onclick);
        }) || null;
    }

    function simulateRowClick(rowElement) {
        if (!rowElement) {
            return;
        }

        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        rowElement.dispatchEvent(clickEvent);

        if (typeof rowElement.click === 'function') {
            rowElement.click();
        }
    }

    try {
        if (!isAccountInfoPage()) {
            console.warn('[Demo Automation] Not on AccountInfo.cfm page; skipping demo inspection.');
            return;
        }

        if (document.readyState !== 'complete') {
            await waitForCondition(() => document.readyState === 'complete');
        }

        const demoRowResult = await waitForCondition(findDemoOrderRow);

        if (!demoRowResult) {
            console.warn('[Demo Automation] Unable to find demo order row.');
            return;
        }

        const demoOrderNumber = extractOrderNumberFromAnchor(demoRowResult.orderAnchor);

        if (!demoOrderNumber) {
            console.warn('[Demo Automation] Unable to determine demo order number from demo row.');
            return;
        }

        console.log(`[Demo Automation] Found demo order number ${demoOrderNumber} for Order #${orderID}.`);

        const targetRow = await waitForCondition(() => findCorrespondingRow(demoOrderNumber), { timeout: 20000 });

        if (!targetRow) {
            console.warn(`[Demo Automation] Unable to locate row for demo order #${demoOrderNumber}.`);
            return;
        }

        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        simulateRowClick(targetRow);
        console.log(`[Demo Automation] Triggered open for demo order #${demoOrderNumber}.`);

        const viewDemoLabelLink = await waitForCondition(findViewDemoLabelLink, { timeout: 20000 });

        if (!viewDemoLabelLink) {
            console.warn(`[Demo Automation] Unable to find "View Demo Label" link for order #${demoOrderNumber}.`);
            return;
        }

        viewDemoLabelLink.click();
        console.log(`[Demo Automation] Clicked "View Demo Label" for order #${demoOrderNumber}.`);
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
