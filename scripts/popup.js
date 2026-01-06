// Entry file - DOM event listeners and initialization

document.addEventListener('DOMContentLoaded', function() {
  const openXButton = document.getElementById('openX');
  const openListsButton = document.getElementById('openLists');
  const listInteraction = document.getElementById('listInteraction');
  const interactWithListButton = document.getElementById('interactWithList');
  const listNameInput = document.getElementById('listNameInput');
  const fetchPostsDataButton = document.getElementById('fetchPostsData');
  
  openXButton.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    openX();
    // Return false to prevent popup from closing
    return false;
  });
  
  openListsButton.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!openListsButton.disabled) {
      logToTwitterConsole();
      // Check if on lists page after navigation
      setTimeout(() => {
        checkIfOnListsPage();
      }, 2000);
    }
    return false;
  });
  
  interactWithListButton.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    const listName = listNameInput.value.trim();
    if (listName) {
      logListNameToConsole(listName);
    }
    return false;
  });
  
  // Allow Enter key to trigger the button
  listNameInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      interactWithListButton.click();
    }
  });
  
  // Add event listener for fetch posts data button
  if (fetchPostsDataButton) {
    fetchPostsDataButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      fetchAllPostsData();
      return false;
    });
  }
  
  // Check login status when popup opens
  checkLoginStatusOnPopupOpen();
  
  // Check if already on lists page when popup opens
  checkIfOnListsPage();
});

