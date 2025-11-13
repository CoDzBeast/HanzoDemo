const DEMO_LABELS_STORAGE_KEY = 'demoLabelsQueue';

function storeDemoLabel(orderNumber) {
    const normalizedOrder = (orderNumber || '').trim();

    if (!normalizedOrder) {
        console.warn('[Demo Automation] Unable to store demo label without an order number.');
        return;
    }

    chrome.storage.local.get([DEMO_LABELS_STORAGE_KEY], (result) => {
        const existingQueue = Array.isArray(result[DEMO_LABELS_STORAGE_KEY]) ? result[DEMO_LABELS_STORAGE_KEY] : [];

        const alreadyQueued = existingQueue.some((entry) => entry.orderNumber === normalizedOrder);
        if (alreadyQueued) {
            console.log(`[Demo Automation] Demo label for Order #${normalizedOrder} is already queued.`);
            return;
        }

        const updatedQueue = [
            ...existingQueue,
            {
                orderNumber: normalizedOrder,
                savedAt: new Date().toISOString()
            }
        ];

        chrome.storage.local.set({ [DEMO_LABELS_STORAGE_KEY]: updatedQueue }, () => {
            if (chrome.runtime.lastError) {
                console.error('[Demo Automation] Failed to store demo label queue:', chrome.runtime.lastError);
                return;
            }

            console.log(`[Demo Automation] Stored demo label for Order #${normalizedOrder}.`);
        });
    });
}

// Function to handle additional functionality when both demo and signature are found
function runAdditionalFunctionality(orderNumber) {
    console.log(`Running additional functionality for Order #${orderNumber}`);
    storeDemoLabel(orderNumber);
    chrome.runtime.sendMessage({ action: "inspectDemoOrder", orderID: orderNumber });
}
