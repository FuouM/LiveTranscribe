// Theme management functions

export function initializeThemeToggle() {
  const themeToggle = document.getElementById("theme-toggle");
  const savedTheme = localStorage.getItem("theme") || "dark";

  // Set initial theme
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  // Add click handler (only if element exists)
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";

      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      updateThemeIcon(newTheme);
    });
  } else {
    console.warn("Theme toggle button not found in DOM");
  }
}

export function updateThemeIcon(theme) {
  const themeIcon = document.querySelector(".theme-icon");
  if (themeIcon) {
    // Remove existing icon classes
    themeIcon.classList.remove("theme-icon-moon", "theme-icon-sun");
    // Add the appropriate icon class
    themeIcon.classList.add(
      theme === "dark" ? "theme-icon-moon" : "theme-icon-sun"
    );
    // Clear text content since we're using CSS pseudo-elements
    themeIcon.textContent = "";
  }
}
