const DEMO_ORDER_STORAGE_KEY = 'demoOrderNumber';
let demoOrderCaptured = false;
let workflowStarted = false;
let userClickedOrderRow = false;

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
        waitForDemoRow();
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
