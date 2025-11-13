const toggleSwitch = document.getElementById('toggleSwitch');

// Load the stored state and update the switch
chrome.storage.local.get('extensionEnabled', function(data) {
    toggleSwitch.checked = data.extensionEnabled !== undefined ? data.extensionEnabled : true;
});

// Save the new state whenever the switch is toggled
toggleSwitch.addEventListener('change', function() {
    const newState = this.checked;
    chrome.storage.local.set({ 'extensionEnabled': newState });
    chrome.runtime.sendMessage({
        action: 'toggleExtension',
        extensionEnabled: newState
    });
});
