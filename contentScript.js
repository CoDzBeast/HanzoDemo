const DEMO_ORDER_STORAGE_KEY = 'demoOrderNumber';
let demoOrderCaptured = false;
let workflowStarted = false;

function waitForDemoRow() {
    const table = document.querySelector('.table.table-striped');
    if (table) {
        console.log('Demo table found — extracting demo order.');
        extractDemoOrder(table);
        return;
    }

    setTimeout(waitForDemoRow, 500);
}

function extractDemoOrder(table) {
    if (demoOrderCaptured) {
        return;
    }

    let order = null;

    const rows = table.querySelectorAll('tr');
    rows.forEach((row) => {
        if (row.innerText.includes('O')) {
            const link = row.querySelector("a[href*='iorder=']");
            if (link) {
                order = link.textContent.trim();
            }
        }
    });

    if (!order) {
        console.warn('No demo order found. Retrying…');
        return setTimeout(waitForDemoRow, 500);
    }

    chrome.runtime.sendMessage({ type: 'saveDemoOrder', order });
    chrome.storage.local.set({ [DEMO_ORDER_STORAGE_KEY]: order });
    demoOrderCaptured = true;
    console.log('Demo order saved:', order);
}

function requestStoredDemoOrder() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getDemoOrder' }, (response) => {
            if (response && response.order) {
                resolve(response.order);
                return;
            }

            chrome.storage.local.get([DEMO_ORDER_STORAGE_KEY], (data) => {
                resolve(data[DEMO_ORDER_STORAGE_KEY] || null);
            });
        });
    });
}

function waitForDemoLabelButton() {
    const int = setInterval(() => {
        const btn = document.querySelector('a[onclick="viewDemoLabel();"]');
        if (btn) {
            clearInterval(int);
            console.log('Clicking Demo Label button');
            btn.click();
        }
    }, 300);
}

function openDemoPanel(orderNumber) {
    const panels = document.querySelectorAll('.rwOrdr');
    for (const panel of panels) {
        if (panel.textContent.includes(`#${orderNumber}`)) {
            workflowStarted = true;
            console.log('Opening demo panel:', orderNumber);
            panel.click();
            waitForDemoLabelButton();
            return;
        }
    }

    console.warn('Panel for demo order NOT found:', orderNumber);
}

function startWorkflow() {
    if (workflowStarted) {
        return;
    }

    requestStoredDemoOrder().then((order) => {
        if (!order) {
            console.warn('Demo order not found in storage.');
            return;
        }

        openDemoPanel(order);
    });
}

function handleShippingModal(modal) {
    console.log('Shipping modal opened — extracting AccountInfo link…');

    const link = modal.querySelector('#Cust0');
    if (!link) {
        console.warn('No customer link found inside modal.');
        return;
    }

    const accountUrl = link.href || link.getAttribute('href');
    if (!accountUrl || !accountUrl.includes('AccountInfo.cfm')) {
        console.warn('Customer link does not point to AccountInfo.');
        return;
    }

    chrome.runtime.sendMessage({
        type: 'openAccountInfo',
        url: accountUrl,
    });

    console.log('Opening AccountInfo to scrape demo order:', accountUrl);
    startWorkflow();
}

function detectExistingModal() {
    const modal = document.querySelector('.modal-content');
    if (modal) {
        handleShippingModal(modal);
    }
}

function observeForModal() {
    const obs = new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.matches('.modal-content')) {
                    handleShippingModal(node);
                }
            });
        });
    });
    obs.observe(document.body, { childList: true, subtree: true });
}

function init() {
    const url = window.location.href;

    if (/\/AccountInfo\.cfm/i.test(url)) {
        waitForDemoRow();
    }

    if (location.href.includes('Shipping.cfm')) {
        detectExistingModal();
        observeForModal();
    }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[DEMO_ORDER_STORAGE_KEY]) {
        const order = changes[DEMO_ORDER_STORAGE_KEY].newValue;
        if (order) {
            console.log('Demo order updated in storage:', order);
            workflowStarted = false;
            openDemoPanel(order);
        }
    }
});

init();
