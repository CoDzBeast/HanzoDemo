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

function findOrderPanel(modalElement, demoOrderNumber) {
    if (!modalElement || !demoOrderNumber) {
        return null;
    }

    const selector = `div.row.rwOrdr[onclick*="GetOrder(${demoOrderNumber}"]`;
    const directMatch = modalElement.querySelector(selector);
    if (directMatch) {
        return directMatch;
    }

    return Array.from(modalElement.querySelectorAll('div.row.rwOrdr')).find((row) => {
        return (row.innerHTML || '').includes(`#${demoOrderNumber}`);
    }) || null;
}

function findDemoLabelLink(modalElement) {
    if (!modalElement) {
        return null;
    }

    return Array.from(modalElement.querySelectorAll('a')).find((anchor) => {
        const onclick = (anchor.getAttribute('onclick') || '').toLowerCase();
        const text = (anchor.textContent || '').trim().toLowerCase();
        return onclick.includes('viewdemolabel') || text === 'view demo label';
    }) || null;
}

function triggerClick(target) {
    if (!target) {
        return;
    }

    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    if (typeof target.click === 'function') {
        target.click();
    }
}

async function runShippingFlow(modalElement) {
    const demoOrderNumber = await requestStoredDemoOrder();
    if (!demoOrderNumber) {
        return;
    }

    const panel = findOrderPanel(modalElement, demoOrderNumber);
    if (panel) {
        triggerClick(panel);
        if (typeof GetOrder === 'function') {
            GetOrder(demoOrderNumber, 0);
        }
    }

    const demoLabelLink = findDemoLabelLink(modalElement);
    if (demoLabelLink) {
        triggerClick(demoLabelLink);
    }
}

function observeShippingModal() {
    const body = document.body;
    if (!body) {
        return;
    }

    const attachObservers = (modalElement) => {
        if (!modalElement || modalElement.dataset.demoObserverAttached === 'true') {
            return;
        }

        const observer = new MutationObserver(() => {
            runShippingFlow(modalElement);
        });

        observer.observe(modalElement, { childList: true, subtree: true });

        modalElement.addEventListener('click', (event) => {
            if (event.target.closest('.nextLink') || event.target.closest('.prevLink') || event.target.closest('div.row.rwOrdr')) {
                runShippingFlow(modalElement);
            }
        });

        modalElement.dataset.demoObserverAttached = 'true';
        runShippingFlow(modalElement);
    };

    const existingModal = document.querySelector('.modal-content');
    if (existingModal) {
        attachObservers(existingModal);
    }

    const bodyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }

                if (node.classList.contains('modal-content')) {
                    attachObservers(node);
                    continue;
                }

                const modalDescendant = node.querySelector && node.querySelector('.modal-content');
                if (modalDescendant) {
                    attachObservers(modalDescendant);
                }
            }
        }
    });

    bodyObserver.observe(body, { childList: true, subtree: true });
}

function init() {
    const url = window.location.href;

    if (/\/AccountInfo\.cfm/i.test(url)) {
        handleAccountInfoPage();
    }

    if (/\/Shipping\.cfm/i.test(url)) {
        waitForElement('.modal-content').then(() => observeShippingModal()).catch(() => observeShippingModal());
    }
}

init();
