// Utility function to load HTML templates

export async function loadHtmlTemplate(templatePath) {
  try {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Error loading HTML template ${templatePath}:`, error);
    throw error;
  }
}
