const toggleSwitch = document.getElementById('toggleSwitch');
const demoLabelsList = document.getElementById('demoLabelsList');
const demoLabelsEmptyState = document.getElementById('demoLabelsEmptyState');
const clearDemoLabelsBtn = document.getElementById('clearDemoLabelsBtn');

const DEMO_LABELS_STORAGE_KEY = 'demoLabelsQueue';

function renderDemoLabels(queue) {
    if (!demoLabelsList || !demoLabelsEmptyState || !clearDemoLabelsBtn) {
        return;
    }

    const labels = Array.isArray(queue) ? [...queue] : [];
    labels.sort((a, b) => {
        const dateA = new Date(a.savedAt || 0).getTime();
        const dateB = new Date(b.savedAt || 0).getTime();
        return dateA - dateB;
    });

    demoLabelsList.innerHTML = '';

    if (labels.length === 0) {
        demoLabelsEmptyState.style.display = 'block';
        clearDemoLabelsBtn.disabled = true;
        return;
    }

    demoLabelsEmptyState.style.display = 'none';
    clearDemoLabelsBtn.disabled = false;

    labels.forEach((label) => {
        const orderNumber = label.orderNumber || '';
        const savedAt = label.savedAt ? new Date(label.savedAt) : null;

        const item = document.createElement('li');
        item.className = 'demo-label';

        const header = document.createElement('div');
        header.className = 'demo-label-header';
        header.textContent = orderNumber ? `Order #${orderNumber}` : 'Order';

        const timestamp = document.createElement('div');
        timestamp.className = 'demo-label-timestamp';
        timestamp.textContent = savedAt && !isNaN(savedAt.getTime())
            ? `Saved ${savedAt.toLocaleString()}`
            : 'Saved recently';

        const actions = document.createElement('div');
        actions.className = 'demo-label-actions';

        const printButton = document.createElement('button');
        printButton.className = 'print';
        printButton.dataset.action = 'print';
        printButton.dataset.orderNumber = orderNumber;
        printButton.textContent = 'Print';

        const removeButton = document.createElement('button');
        removeButton.className = 'remove';
        removeButton.dataset.action = 'remove';
        removeButton.dataset.orderNumber = orderNumber;
        removeButton.textContent = 'Remove';

        actions.appendChild(printButton);
        actions.appendChild(removeButton);

        item.appendChild(header);
        item.appendChild(timestamp);
        item.appendChild(actions);

        demoLabelsList.appendChild(item);
    });
}

function loadDemoLabels() {
    chrome.storage.local.get([DEMO_LABELS_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to load demo labels:', chrome.runtime.lastError);
            return;
        }

        renderDemoLabels(result[DEMO_LABELS_STORAGE_KEY] || []);
    });
}

function removeDemoLabel(orderNumber) {
    chrome.storage.local.get([DEMO_LABELS_STORAGE_KEY], (result) => {
        const queue = Array.isArray(result[DEMO_LABELS_STORAGE_KEY]) ? result[DEMO_LABELS_STORAGE_KEY] : [];
        const updatedQueue = queue.filter((entry) => entry.orderNumber !== orderNumber);

        chrome.storage.local.set({ [DEMO_LABELS_STORAGE_KEY]: updatedQueue }, () => {
            if (chrome.runtime.lastError) {
                console.error('Failed to remove demo label:', chrome.runtime.lastError);
            }
        });
    });
}

function clearDemoLabels() {
    chrome.storage.local.set({ [DEMO_LABELS_STORAGE_KEY]: [] }, () => {
        if (chrome.runtime.lastError) {
            console.error('Failed to clear demo labels:', chrome.runtime.lastError);
        }
    });
}

function requestDemoLabelPrint(orderNumber) {
    chrome.runtime.sendMessage({ action: 'printDemoLabel', orderID: orderNumber }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to trigger demo label print:', chrome.runtime.lastError);
            return;
        }

        if (!response || !response.success) {
            console.warn('Demo label print request did not complete successfully.');
        }
    });
}

if (toggleSwitch) {
    chrome.storage.local.get('extensionEnabled', function(data) {
        toggleSwitch.checked = data.extensionEnabled !== undefined ? data.extensionEnabled : true;
    });

    toggleSwitch.addEventListener('change', function() {
        const newState = this.checked;
        chrome.storage.local.set({ 'extensionEnabled': newState });
        chrome.runtime.sendMessage({
            action: 'toggleExtension',
            extensionEnabled: newState
        });
    });
}

if (demoLabelsList) {
    demoLabelsList.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest('button') : null;

        if (!target || !target.dataset) {
            return;
        }

        const { action, orderNumber } = target.dataset;

        if (!orderNumber) {
            return;
        }

        if (action === 'print') {
            requestDemoLabelPrint(orderNumber);
        }

        if (action === 'remove') {
            removeDemoLabel(orderNumber);
        }
    });
}

if (clearDemoLabelsBtn) {
    clearDemoLabelsBtn.addEventListener('click', () => {
        if (!clearDemoLabelsBtn.disabled) {
            clearDemoLabels();
        }
    });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, DEMO_LABELS_STORAGE_KEY)) {
        renderDemoLabels(changes[DEMO_LABELS_STORAGE_KEY].newValue || []);
    }
});

loadDemoLabels();
