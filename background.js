let tabOpenedRecently = false;
let newTabId = null;
let extensionEnabled = true; // Default state

// Get extensionEnabled state from storage
chrome.storage.local.get(['extensionEnabled'], function(result) {
    if (result.extensionEnabled !== undefined) {
        extensionEnabled = result.extensionEnabled;
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleExtension") {
        extensionEnabled = request.extensionEnabled;
        chrome.storage.local.set({ 'extensionEnabled': extensionEnabled });
    }

    if (extensionEnabled && request.action === "processOrder" && !tabOpenedRecently) {
        const accountPageUrl = `https://www.hattorihanzoshears.com/cgi-bin/AccountInfo.cfm?iOrder=${request.orderID}`;
        
        tabOpenedRecently = true;
        chrome.tabs.create({ url: accountPageUrl, active: true }, (tab) => {
            newTabId = tab.id;

            // Wait for the account page to load
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === tab.id && changeInfo.status === "complete") {
                    // Inject a script to handle opening the return label
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: openReturnLabel,
                        args: [request.orderID]
                    });

                    chrome.tabs.onUpdated.removeListener(listener);
                }
            });
        });
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

// Reset tabOpenedRecently after the tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === newTabId) {
        tabOpenedRecently = false;
    }
});
