// Simple model status service for the demo
export async function checkModelStatus(modelId) {
  // For demo purposes, assume all models are available
  return {
    status: "found",
    selectedVariant: "default",
  };
}

export async function checkAllModelsStatus() {
  // Implementation for checking model availability
  return {};
}
