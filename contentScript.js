let cachedDemoOrderNumber = null;

function waitForCondition(conditionFn, { timeout = 15000, interval = 250 } = {}) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkCondition = () => {
            try {
                const result = conditionFn();
                if (result) {
                    resolve(result);
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            if (Date.now() - startTime >= timeout) {
                reject(new Error('Timed out waiting for condition'));
                return;
            }

            setTimeout(checkCondition, interval);
        };

        checkCondition();
    });
}

function normaliseOrderNumber(value) {
    if (!value) {
        return null;
    }

    const digits = value.toString().trim().replace(/\D+/g, '');
    return digits || null;
}

function storeDemoOrderNumber(orderNumber) {
    if (!orderNumber) {
        return;
    }

    cachedDemoOrderNumber = orderNumber;
    chrome.runtime.sendMessage({ action: 'storeDemoOrderNumber', orderNumber });
}

function requestStoredDemoOrderNumber() {
    return new Promise((resolve) => {
        if (cachedDemoOrderNumber) {
            resolve(cachedDemoOrderNumber);
            return;
        }

        chrome.runtime.sendMessage({ action: 'getDemoOrderNumber' }, (response) => {
            if (response && response.orderNumber) {
                cachedDemoOrderNumber = response.orderNumber;
                resolve(response.orderNumber);
            } else {
                resolve(null);
            }
        });
    });
}

async function handleAccountInfoPage() {
    try {
        const table = await waitForCondition(() => document.querySelector('table.table.table-striped'));
        const rows = Array.from(table.querySelectorAll('tr'));

        for (const row of rows) {
            const demoCell = Array.from(row.querySelectorAll('td')).find((cell) => {
                const align = (cell.getAttribute('align') || '').toLowerCase();
                const text = (cell.textContent || '').trim();
                return align === 'center' && text === 'O';
            });

            if (!demoCell) {
                continue;
            }

            const orderAnchor = row.querySelector('a[href*="iorder="]');
            const orderNumber = normaliseOrderNumber(orderAnchor ? orderAnchor.textContent : null) || normaliseOrderNumber(orderAnchor ? orderAnchor.getAttribute('href') : null);

            if (orderNumber) {
                storeDemoOrderNumber(orderNumber);
                console.log(`[Demo Automation] Captured demo order number ${orderNumber} from AccountInfo.cfm.`);
                return;
            }
        }

        console.warn('[Demo Automation] Demo order row not found on AccountInfo.cfm.');
    } catch (error) {
        console.error(`[Demo Automation] Failed to capture demo order on AccountInfo.cfm: ${error.message}`);
    }
}

function findDemoOrderRow(modalElement, demoOrderNumber) {
    if (!modalElement || !demoOrderNumber) {
        return null;
    }

    const attributeSelector = `div.row.rwOrdr[onclick*="GetOrder(${demoOrderNumber}"]`;
    const directMatch = modalElement.querySelector(attributeSelector);

    if (directMatch) {
        return directMatch;
    }

    return Array.from(modalElement.querySelectorAll('div.row.rwOrdr')).find((row) => {
        const rowText = row.textContent || '';
        return rowText.includes(`#${demoOrderNumber}`);
    }) || null;
}

function findViewDemoLabelLink(modalElement) {
    if (!modalElement) {
        return null;
    }

    const anchors = Array.from(modalElement.querySelectorAll('a'));
    return anchors.find((anchor) => {
        const text = (anchor.textContent || '').trim().toLowerCase();
        const onclick = (anchor.getAttribute('onclick') || '').toLowerCase();
        return text === 'view demo label' || onclick.includes('viewdemolabel');
    }) || null;
}

function simulateClick(target) {
    if (!target) {
        return;
    }

    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    if (typeof target.click === 'function') {
        target.click();
    }
}

async function runShippingWorkflow(modalElement) {
    try {
        const demoOrderNumber = await requestStoredDemoOrderNumber();

        if (!demoOrderNumber) {
            console.warn('[Demo Automation] No stored demo order number available.');
            return;
        }

        const targetRow = await waitForCondition(() => findDemoOrderRow(modalElement, demoOrderNumber));
        simulateClick(targetRow);
        console.log(`[Demo Automation] Opened demo order panel for #${demoOrderNumber}.`);

        const demoLabelLink = await waitForCondition(() => findViewDemoLabelLink(modalElement));
        simulateClick(demoLabelLink);
        console.log('[Demo Automation] Triggered "View Demo Label" link.');
    } catch (error) {
        console.error(`[Demo Automation] Failed to process shipping modal: ${error.message}`);
    }
}

function setupModalObservers(modalElement) {
    if (!modalElement || modalElement.dataset.demoObserverAttached === 'true') {
        return;
    }

    let rerunTimer = null;
    const scheduleRun = () => {
        if (rerunTimer) {
            clearTimeout(rerunTimer);
        }
        rerunTimer = setTimeout(() => runShippingWorkflow(modalElement), 300);
    };

    const modalObserver = new MutationObserver(scheduleRun);
    modalObserver.observe(modalElement, { childList: true, subtree: true });

    modalElement.addEventListener('click', (event) => {
        if (event.target.closest('.nextLink') || event.target.closest('.prevLink') || event.target.closest('div.row.rwOrdr')) {
            scheduleRun();
        }
    });

    modalElement.dataset.demoObserverAttached = 'true';
    scheduleRun();
}

function observeForModal() {
    const body = document.body;
    if (!body) {
        return;
    }

    const existingModal = document.querySelector('.modal-content');
    if (existingModal) {
        setupModalObservers(existingModal);
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }

                if (node.classList.contains('modal-content')) {
                    setupModalObservers(node);
                    continue;
                }

                const modalDescendant = node.querySelector && node.querySelector('.modal-content');
                if (modalDescendant) {
                    setupModalObservers(modalDescendant);
                }
            }
        }
    });

    observer.observe(body, { childList: true, subtree: true });
}

function init() {
    const currentUrl = window.location.href;

    if (/\/AccountInfo\.cfm/i.test(currentUrl)) {
        handleAccountInfoPage();
    }

    if (/\/Shipping\.cfm/i.test(currentUrl)) {
        observeForModal();
    }
}

init();

