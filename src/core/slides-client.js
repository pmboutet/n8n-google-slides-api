/**
 * Google Slides API Client optimized for n8n
 * Handles authentication, API calls, and response processing
 */

class SlidesClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://slides.googleapis.com/v1';
  }

  /**
   * Get presentation data including layouts and master slides
   * @param {string} presentationId - The presentation ID
   * @returns {Promise<Object>} Presentation data
   */
  async getPresentation(presentationId) {
    try {
      const response = await this.makeRequest(
        `${this.baseUrl}/presentations/${presentationId}`,
        'GET'
      );
      return response;
    } catch (error) {
      throw new Error(`Failed to get presentation: ${error.message}`);
    }
  }

  /**
   * Create a new slide using batch update
   * @param {string} presentationId - The presentation ID
   * @param {Array} requests - Array of batch update requests
   * @returns {Promise<Object>} Batch update response
   */
  async batchUpdate(presentationId, requests) {
    try {
      const response = await this.makeRequest(
        `${this.baseUrl}/presentations/${presentationId}:batchUpdate`,
        'POST',
        { requests }
      );
      return response;
    } catch (error) {
      throw new Error(`Failed to batch update: ${error.message}`);
    }
  }

  /**
   * Make HTTP request to Google Slides API
   * @param {string} url - API endpoint URL
   * @param {string} method - HTTP method
   * @param {Object} body - Request body
   * @returns {Promise<Object>} API response
   */
  async makeRequest(url, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API Error ${response.status}: ${errorData.error?.message || response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Generate slide URL for direct access
   * @param {string} presentationId - The presentation ID
   * @param {string} slideId - The slide ID
   * @returns {string} Direct slide URL
   */
  generateSlideUrl(presentationId, slideId) {
    return `https://docs.google.com/presentation/d/${presentationId}/edit#slide=id.${slideId}`;
  }
}

// Export for n8n usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SlidesClient;
} else {
  // For n8n Function node
  this.SlidesClient = SlidesClient;
}