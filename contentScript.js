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

function extractDemoOrderNumber(row) {
    if (!row) {
        return null;
    }

    const orderAnchor = row.querySelector('a[href*="iorder="]');
    if (!orderAnchor) {
        return null;
    }

    const hrefMatch = orderAnchor.getAttribute('href').match(/iorder=(\d+)/i);
    if (hrefMatch && hrefMatch[1]) {
        return hrefMatch[1];
    }

    const textMatch = (orderAnchor.textContent || '').match(/(\d+)/);
    return textMatch ? textMatch[1] : null;
}

async function handleAccountInfoPage() {
    try {
        const table = await waitForElement('table.table.table-striped');
        const rows = Array.from(table.querySelectorAll('tr'));

        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            const hasDemoMarker = cells.some((cell) => {
                const align = (cell.getAttribute('align') || '').toLowerCase();
                const text = (cell.textContent || '').trim();
                return align === 'center' && text === 'O';
            });

            if (!hasDemoMarker) {
                continue;
            }

            const demoOrderNumber = extractDemoOrderNumber(row);
            if (demoOrderNumber) {
                chrome.storage.local.set({ [DEMO_ORDER_STORAGE_KEY]: demoOrderNumber });
                chrome.runtime.sendMessage({ type: 'saveDemoOrder', order: demoOrderNumber });
                return;
            }
        }
    } catch (error) {
        console.error(`[Demo Automation] Failed to capture demo order: ${error.message}`);
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

function startShippingWorkflow(modalElement) {
    chrome.runtime.sendMessage({ type: "getDemoOrder" }, ({ order }) => {
        if (!order) {
            console.warn("No demo order stored.");
            return;
        }

        openCorrectOrderPanel(order);
    });
}

function openCorrectOrderPanel(orderNumber) {
    const panels = document.querySelectorAll('.rwOrdr');

    for (const panel of panels) {
        if (panel.textContent.includes(`#${orderNumber}`)) {
            console.log('Opening panel for demo order:', orderNumber);
            panel.click();
            waitForDemoLabelButton();
            return;
        }
    }

    console.warn('Demo order panel not found:', orderNumber);
}

function waitForDemoLabelButton() {
    const int = setInterval(() => {
        const btn = document.querySelector('a[onclick="viewDemoLabel();"]');
        if (btn) {
            clearInterval(int);
            console.log('Clicking View Demo Label button');
            btn.click();
        }
    }, 300);
}

function observeShippingModal() {
    if (!location.href.includes('Shipping.cfm')) {
        return;
    }

    const existingModal = document.querySelector('.modal-content');
    if (existingModal) {
        startShippingWorkflow(existingModal);
    }

    const body = document.body;
    if (!body) {
        return;
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node instanceof HTMLElement && node.matches('.modal-content')) {
                    console.log('Modal detected — starting workflow');
                    startShippingWorkflow(node);
                }
            }
        }
    });

    observer.observe(body, { childList: true, subtree: true });
}

function init() {
    const url = window.location.href;

    if (/\/AccountInfo\.cfm/i.test(url)) {
        handleAccountInfoPage();
    }

    observeShippingModal();
}

init();
