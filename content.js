console.log("Extension is running");

async function openCust0Link() {
    const currentURL = new URL(window.location.href);

    if (currentURL.searchParams.get("openedByExtension")) return;

    const pencilIcons = document.querySelectorAll(".pull-right.fa.fa-pencil-square-o.fa-2x");

    let warningPencilIcon = null;
    let successPencilIcon = null;

    pencilIcons.forEach((icon) => {
        if (icon.classList.contains("text-warning")) {
            warningPencilIcon = icon;
        }
        if (icon.classList.contains("text-success")) {
            successPencilIcon = icon;
        }
    });

    if (warningPencilIcon && !successPencilIcon) {
        const iOrd1Element = document.querySelector("#iOrd1");
        const iOrd1Text = iOrd1Element.textContent;
        await navigator.clipboard.writeText(iOrd1Text);
        const newURL = `https://www.hattorihanzoshears.com/cgi-bin/AccountInfo.cfm?iOrder=${iOrd1Text}`;

        chrome.storage.local.get("lastOpenedURL", (data) => {
            if (data.lastOpenedURL !== newURL) {
                chrome.runtime.sendMessage({ url: newURL, iOrd1Id: iOrd1Text });
                chrome.storage.local.set({ lastOpenedURL: newURL });
            }
        });
    }
}

function scrollElementIntoView(orderNumber) {
    const element = document.querySelector(`[id="OShip${orderNumber}"]`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function observeBody() {
    const targetNode = document.querySelector("body");

    if (targetNode) {
        const config = { attributes: true, childList: true, subtree: true, attributeFilter: ["class"] };

        const callback = function (mutationsList) {
            for (const mutation of mutationsList) {
                if (mutation.type === "attributes" && mutation.attributeName === "class") {
                    openCust0Link();
                }
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
    } else {
        setTimeout(observeBody, 1000);
    }
}

function handleModalShowEvent() {
    const rrqText = document.querySelector("#RRqText");
    const txtEmailSubject = document.querySelector("#txtEmailSubject");

    if (rrqText && txtEmailSubject) {
        navigator.clipboard.readText().then((clipboardData) => {
            const orderNumber = clipboardData;
            rrqText.value = `Order ${orderNumber} needs a signature on file in order to ship`;
            txtEmailSubject.value = `Order ${orderNumber}`;
        });
    }
}

function observeModal() {
    const repReqModal = document.querySelector('#RepReq');

    if (repReqModal) {
        console.log("Found RepReq");
        const config = { attributes: true, attributeFilter: ["aria-hidden"] };

        const callback = function (mutationsList) {
            for (const mutation of mutationsList) {
                if (mutation.type === "attributes" && mutation.attributeName === "aria-hidden") {
                    console.log("aria-hidden changed");
                    if (repReqModal.getAttribute("aria-hidden") === "false") {
                        console.log("Modal is visible");
                        handleModalShowEvent();
                    }
                }
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(repReqModal, config);
    } else {
        console.log("RepReq not found");
        setTimeout(observeModal, 1000);
    }
}

observeBody();
observeModal();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "scrollElementIntoView") {
        scrollElementIntoView(message.iOrd1Id);
    }
});

