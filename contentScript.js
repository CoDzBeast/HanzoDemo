const DEMO_ORDER_STORAGE_KEY = 'demoOrderNumber';
let demoOrderCaptured = false;
let workflowStarted = false;
let userClickedOrderRow = false;

function getDemoTable() {
    const headers = Array.from(document.querySelectorAll('h4'));
    const demoHeader = headers.find((h) => h.innerText.trim().startsWith('Demo Shears'));

    if (!demoHeader) return null;

    return demoHeader.closest('.boxed')?.querySelector('table.table');
}

function findOpenDemoRow(table) {
    const rows = table.querySelectorAll('tbody tr');

    for (const row of rows) {
        const statusCell = row.querySelector('td:first-child');
        if (!statusCell) continue;

        if (statusCell.innerText.trim() === 'O') {
            return row;
        }
    }

    return null;
}

function extractDemoOrderNumber(row) {
    const orderLink = row.querySelector('td:nth-child(2) a');

    if (orderLink) {
        return orderLink.innerText.trim();
    }

    return null;
}

function handleDemoOrder(order) {
    if (demoOrderCaptured) {
        return;
    }

    chrome.runtime.sendMessage({ type: 'saveDemoOrder', order });
    chrome.storage.local.set({ [DEMO_ORDER_STORAGE_KEY]: order });
    demoOrderCaptured = true;
    console.log('Demo order saved:', order);
}

function waitForDemoOrder(attempt = 0) {
    console.log('🔍 Looking for Demo Shears table…');

    const table = getDemoTable();
    if (!table) {
        if (attempt < 40) {
            return setTimeout(() => waitForDemoOrder(attempt + 1), 250);
        }
        console.error('❌ Demo table not found after waiting.');
        return;
    }

    console.log('✔ Demo table found — searching for open demo row…');

    const row = findOpenDemoRow(table);
    if (!row) {
        if (attempt < 40) {
            console.log('⏳ Demo row not ready yet. Retrying…');
            return setTimeout(() => waitForDemoOrder(attempt + 1), 250);
        }
        console.error('❌ Demo OPEN row not found.');
        return;
    }

    const orderNumber = extractDemoOrderNumber(row);
    if (orderNumber) {
        console.log('🎉 DEMO ORDER FOUND:', orderNumber);
        handleDemoOrder(orderNumber);
        return;
    }

    console.error('❌ Failed to extract demo order number from row.');
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

function isRealModal(node) {
    return (
        node.classList.contains('modal-content') &&
        node.offsetParent !== null
    );
}

function startModalWorkflow(modal) {
    if (!userClickedOrderRow) {
        console.warn('Ignoring modal because no order row click was detected.');
        return;
    }

    console.log('🔥 REAL Shipping modal detected — workflow begins now.');

    waitForCustomerLink(modal);
}

function waitForCustomerLink(modal) {
    const target = modal.querySelector('#Cust0');

    if (target && target.getAttribute('href')) {
        handleCustomerLink(target);
        return;
    }

    const innerObserver = new MutationObserver(() => {
        const link = modal.querySelector('#Cust0');
        if (link && link.getAttribute('href')) {
            console.log('✔ Customer link ready:', link.getAttribute('href'));
            innerObserver.disconnect();
            handleCustomerLink(link);
        }
    });

    innerObserver.observe(modal, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
    });

    console.log('⏳ Waiting for AccountInfo href to be populated…');
}

function handleCustomerLink(link) {
    const rawHref = link.getAttribute('href');
    if (!rawHref) {
        console.error('❌ STILL missing href — aborting.');
        return;
    }

    const fullUrl = new URL(rawHref, window.location.origin).href;
    console.log('➡ Opening AccountInfo:', fullUrl);

    chrome.runtime.sendMessage({
        type: 'openAccountInfo',
        url: fullUrl,
    });
}

function observeForModal() {
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType === 1) {
                    if (node.matches('.modal-content') && isRealModal(node)) {
                        startModalWorkflow(node);
                        return;
                    }

                    const modal = node.querySelector('.modal-content');
                    if (modal && isRealModal(modal)) {
                        startModalWorkflow(modal);
                        return;
                    }
                }
            }

            if (m.type === 'attributes' && m.target.matches('.modal')) {
                const modal = m.target.querySelector('.modal-content');
                if (modal && isRealModal(modal)) {
                    startModalWorkflow(modal);
                    return;
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
    });
}

function trackOrderRowClicks() {
    document.addEventListener('click', (event) => {
        const orderRow = event.target.closest('.rwOrdr, .table.table-striped tr');
        if (orderRow) {
            userClickedOrderRow = true;
        }
    }, true);
}

function init() {
    const url = window.location.href;

    if (/\/AccountInfo\.cfm/i.test(url)) {
        waitForDemoOrder();
    }

    if (location.href.includes('Shipping.cfm')) {
        trackOrderRowClicks();
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
