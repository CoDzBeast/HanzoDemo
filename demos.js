// Function to handle additional functionality when both demo and signature are found
function runAdditionalFunctionality(orderNumber) {
    console.log(`Running additional functionality for Order #${orderNumber}`);
    chrome.runtime.sendMessage({ action: "inspectDemoOrder", orderID: orderNumber });
}
