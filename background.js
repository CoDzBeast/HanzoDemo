let tabOpenedRecently = false;
let unlockTimer = null;
const managedTabs = new Set();
let extensionEnabled = true; // Default state

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
function openReturnLabel(orderID) {
    // Simulate the click to open the return label based on the injected order ID
    const returnLabelLink = document.querySelector('a[onclick*="viewReturnLabel"]');
    
    if (returnLabelLink) {
        returnLabelLink.click();

        setTimeout(() => {
            const labelURL = returnLabelLink.href;
            if (labelURL && labelURL !== "javascript:") {
                window.open(labelURL, '_blank');
            } else {
                console.error("Return label URL not found.");
            }
        }, 1000);  // Adjust timing as necessary
    } else {
        console.error(`No 'View Return Label' link found for order ID ${orderID}`);
    }
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
