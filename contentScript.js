const DEMO_ORDER_STORAGE_KEY = 'demoOrderNumber';

function waitForElement(selector, { timeout = 20000, interval = 250 } = {}) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const element = document.querySelector(selector);

            if (element) {
                resolve(element);
                return;
            }

            if (Date.now() - startTime >= timeout) {
                reject(new Error(`Timed out waiting for ${selector}`));
                return;
            }

            setTimeout(check, interval);
        };

        check();
    });
}

let demoOrderCaptured = false;
let workflowStarted = false;

function waitForDemoTable() {
    const table = document.querySelector('.table.table-striped');
    if (table) {
        console.log('Demo table found — extracting demo order.');
        extractDemoOrder(table);
        return;
    }

    console.log('Table not ready — retrying...');
    setTimeout(waitForDemoTable, 500);
}

function observeDemoTable() {
    const observer = new MutationObserver(() => {
        const table = document.querySelector('.table.table-striped');
        if (table) {
            console.log('Demo table detected via MutationObserver.');
            extractDemoOrder(table);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function extractDemoOrder(table) {
    if (demoOrderCaptured) {
        return;
    }

    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
        if (row.innerText.includes('O')) {
            const link = row.querySelector("a[href*='iorder=']");
            if (link) {
                const order = link.textContent.trim();
                console.log('Demo order retrieved:', order);
                chrome.storage.local.set({ [DEMO_ORDER_STORAGE_KEY]: order });
                chrome.runtime.sendMessage({ type: 'saveDemoOrder', order });
                demoOrderCaptured = true;
            }
            break;
        }
    }
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

function startWorkflow(modal) {
    if (workflowStarted) {
        return;
    }

    chrome.runtime.sendMessage({ type: 'getDemoOrder' }, ({ order }) => {
        if (!order) {
            console.warn('Demo order not found in storage.');
            return;
        }

        workflowStarted = true;
        openDemoPanel(order);
    });
}

function openDemoPanel(orderNumber) {
    const panels = document.querySelectorAll('.rwOrdr');
    for (const panel of panels) {
        if (panel.textContent.includes(`#${orderNumber}`)) {
            console.log('Opening demo panel:', orderNumber);
            panel.click();
            waitForDemoLabelButton();
            return;
        }
    }

    console.warn('Panel for demo order NOT found:', orderNumber);
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

function detectModalImmediately() {
    const modal = document.querySelector('.modal-content');
    if (modal) {
        console.log('Modal detected immediately — starting workflow');
        startWorkflow(modal);
    }
}

function observeForNewModals() {
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType === 1 && node.matches('.modal-content')) {
                    console.log('Modal detected via observer — starting workflow');
                    startWorkflow(node);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
    const url = window.location.href;

    if (/\/AccountInfo\.cfm/i.test(url)) {
        waitForDemoTable();
        observeDemoTable();
    }

    if (location.href.includes('Shipping.cfm')) {
        detectModalImmediately();
        observeForNewModals();
    }
}

init();
