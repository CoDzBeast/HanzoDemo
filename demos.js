// Function to handle additional functionality when both demo and signature are found
function runAdditionalFunctionality(orderNumber) {
    console.log(`Running additional functionality for Order #${orderNumber}`);

    // Save the order number (e.g., to local storage or to a variable)
    localStorage.setItem('currentOrderNumber', orderNumber);

    // Construct the URL to open the account page using the order number
    const accountUrl = `https://www.hattorihanzoshears.com/cgi-bin/AccountInfo.cfm?iOrder=${orderNumber}`;
    
    // Log the account URL before opening it
    console.log(`Opening account page at URL: ${accountUrl}`);

    // Open the account page in a new tab
    const newTab = window.open(accountUrl, '_blank');

    // Check if the new tab successfully opened
    if (newTab) {
        console.log(`Successfully opened account page for Order #${orderNumber}.`);
    } else {
        console.error(`Failed to open account page for Order #${orderNumber}.`);
        return; // Stop further execution if the new tab doesn't open
    }

    // Add a delay to ensure the page has fully loaded before interacting with it
    setTimeout(() => {
        console.log("Attempting to capture the date from the account page...");

        // Capture the primary date from the <span id="dOrd1"> element
        try {
            const dateElement = document.querySelector('#dOrd1');
            if (dateElement) {
                let primaryOrderDate = dateElement.textContent.trim();

                // Extract only the date part (before the "/")
                primaryOrderDate = primaryOrderDate.split('/')[0].trim();

                // Check if the text content matches a date pattern (e.g., "Aug 26, 2024")
                const datePattern = /^[A-Za-z]{3,9} \d{1,2}, \d{4}$/;  // Matches the "Aug 26, 2024" format
                
                if (datePattern.test(primaryOrderDate)) {
                    console.log(`Primary order date found: ${primaryOrderDate}`);
                    localStorage.setItem('primaryOrderDate', primaryOrderDate); // Store the date if necessary

                    // Now inspect all rows on the page
                    inspectAllRows();
                } else {
                    console.error(`Date format does not match. Found text: ${primaryOrderDate}`);
                }
            } else {
                console.error("Primary date element not found on the account page.");
            }
        } catch (error) {
            console.error("Error while capturing the primary date:", error);
        }
    }, 2000); // Adjust the delay as needed
}

// Function to inspect all div.row elements and log their content
function inspectAllRows() {
    console.log("Inspecting all 'div.row' elements...");

    // Select all 'div.row' elements on the page
    const rows = document.querySelectorAll('div.row');

    // Log the total number of 'div.row' elements found
    console.log(`Total number of 'div.row' elements found: ${rows.length}`);

    // Loop through each 'div.row' element to inspect its content
    rows.forEach((row, index) => {
        console.log(`Inspecting row ${index + 1}:`, row.outerHTML);
    });

    console.log('Inspection complete.');
}
