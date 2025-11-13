// Function to check for the signature and if "demo" or "demos" is present in the modal content
function checkSignatureAndLogOrder() {
    const signatureIcon = document.querySelector("#ySig");
    const orderNumberElement = document.querySelector("#iOrd1"); // The element holding the order number
    const orderNumber = orderNumberElement ? orderNumberElement.textContent : "Unknown Order";
    const tableRows = document.querySelectorAll("#TItems tr"); // Rows of the items table in the modal

    let demoFound = false;
    let hasSignature = false;

    if (orderNumberElement) {
        // Check for signature status
        if (signatureIcon) {
            console.log(`Checking signature for Order #${orderNumber}`);
            if (signatureIcon.classList.contains("text-success")) {
                console.log(`Order #${orderNumber} has a signature.`);
                hasSignature = true;
            } else {
                console.log(`Order #${orderNumber} does NOT have a signature.`);
            }
        } else {
            console.log(`Signature icon not found for Order #${orderNumber}.`);
        }

        // Check if "demo" or "demos" is present in the modal table rows
        tableRows.forEach(row => {
            if (row.innerHTML.toLowerCase().includes("demo")) {
                demoFound = true;
            }
        });

        if (demoFound) {
            console.log(`"Demo" or "Demos" found in Order #${orderNumber}.`);
        } else {
            console.log(`No "Demo" or "Demos" found in Order #${orderNumber}.`);
        }

        // If both demo and signature are found, call the function from demos.js
        if (demoFound && hasSignature) {
            console.log(`Order #${orderNumber} has both a demo and a signature. Executing additional functionality...`);
            runAdditionalFunctionality(orderNumber); // Call the function from demos.js
        }
    } else {
        console.log("Order number not found.");
    }
}

// Function to handle the modal being triggered
function handleModalTriggered() {
    console.log("Modal detected. Checking content...");

    // Run the check for signature and "demo" after a delay to ensure modal content has loaded
    setTimeout(checkSignatureAndLogOrder, 1500); // Adjust the delay as necessary
}

// Use event delegation to listen for clicks on any button with specific attributes
document.addEventListener("click", function(event) {
    // Check if the clicked element matches the class and data attributes for the modal trigger
    if (event.target.matches('a.btn.btn-primary[data-toggle="modal"][data-target="#OrderModal"]')) {
        console.log("Modal triggered by manual click.");
        handleModalTriggered(); // Trigger the modal check when a row is clicked
    }
});

// Initialize event listeners for Next/Previous buttons
function setupNextPrevListeners() {
    const nextButton = document.querySelector('.nextLink');
    const prevButton = document.querySelector('.prevLink');

    if (nextButton) {
        nextButton.addEventListener('click', function () {
            console.log("Next button clicked");
            handleModalTriggered(); // Ensure modal content is handled after clicking Next
        });
    }

    if (prevButton) {
        prevButton.addEventListener('click', function () {
            console.log("Previous button clicked");
            handleModalTriggered(); // Ensure modal content is handled after clicking Previous
        });
    }
}

// Initialize the event listeners
function initialize() {
    setupNextPrevListeners(); // Set up Next/Previous listeners
}

// Run the initialization
initialize();
