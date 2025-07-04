/**
 * n8n Function Node: Create Slide with Content
 * 
 * This function creates a new slide in a Google Slides presentation
 * using the selected layout and populates it with content.
 * 
 * Expected input: $json with 'deckId', 'layout', and 'content' properties
 * Required credentials: Google OAuth2 API in n8n
 */

// Get OAuth2 access token from n8n credentials
const credentials = await this.getCredentials('googleOAuth2Api');
const accessToken = credentials.access_token;

// Get input data
const deckId = $json.deckId;
const layout = $json.layout || $json.selectedLayout;
const content = $json.content;

if (!deckId) {
  throw new Error('deckId is required in input data');
}
if (!layout) {
  throw new Error('layout is required in input data');
}
if (!content) {
  throw new Error('content is required in input data');
}

// Helper function to generate unique IDs
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Helper function to make API requests
async function makeRequest(url, method = 'GET', body = null) {
  const options = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    json: true
  };

  if (body) {
    options.body = body;
  }

  return await $request(options);
}

// Main slide creation function
async function createSlideWithContent() {
  const slideId = generateId();
  const requests = [];
  
  // 1. Create slide with layout
  requests.push({
    createSlide: {
      objectId: slideId,
      slideLayoutReference: {
        layoutId: layout.objectId
      }
    }
  });

  // 2. Prepare content insertion requests
  const contentRequests = prepareContentRequests(layout, content, slideId);
  requests.push(...contentRequests);

  // 3. Execute batch update
  const batchResponse = await makeRequest(
    `https://slides.googleapis.com/v1/presentations/${deckId}:batchUpdate`,
    'POST',
    { requests }
  );

  return {
    slideId,
    batchResponse,
    contentRequests
  };
}

// Prepare content insertion requests based on layout placeholders
function prepareContentRequests(layout, content, slideId) {
  const requests = [];
  const placeholders = layout.placeholders || [];
  
  // Group placeholders by type for easier processing
  const placeholdersByType = {};
  placeholders.forEach(placeholder => {
    if (!placeholdersByType[placeholder.type]) {
      placeholdersByType[placeholder.type] = [];
    }
    placeholdersByType[placeholder.type].push(placeholder);
  });

  // Insert title content
  if (content.title && placeholdersByType.TITLE) {
    const titlePlaceholder = placeholdersByType.TITLE[0];
    requests.push({
      insertText: {
        objectId: titlePlaceholder.objectId,
        text: content.title,
        insertionIndex: 0
      }
    });
  }

  // Insert body content
  if (content.body && placeholdersByType.BODY) {
    const bodyPlaceholder = placeholdersByType.BODY[0];
    let bodyText = content.body;
    
    // Handle bullet points
    if (content.bullets && content.bullets.length > 0) {
      bodyText = content.bullets.map(bullet => `• ${bullet}`).join('\n');
    }
    
    requests.push({
      insertText: {
        objectId: bodyPlaceholder.objectId,
        text: bodyText,
        insertionIndex: 0
      }
    });
  }

  // Insert subtitle content
  if (content.subtitle && placeholdersByType.SUBTITLE) {
    const subtitlePlaceholder = placeholdersByType.SUBTITLE[0];
    requests.push({
      insertText: {
        objectId: subtitlePlaceholder.objectId,
        text: content.subtitle,
        insertionIndex: 0
      }
    });
  }

  // Handle image insertion
  if (content.imageUrl && placeholdersByType.PICTURE) {
    const imagePlaceholder = placeholdersByType.PICTURE[0];
    requests.push({
      replaceImage: {
        imageObjectId: imagePlaceholder.objectId,
        url: content.imageUrl
      }
    });
  }

  // Handle multiple column content
  if (content.columns && placeholdersByType.CONTENT) {
    content.columns.forEach((columnContent, index) => {
      if (placeholdersByType.CONTENT[index]) {
        requests.push({
          insertText: {
            objectId: placeholdersByType.CONTENT[index].objectId,
            text: columnContent,
            insertionIndex: 0
          }
        });
      }
    });
  }

  // Apply text formatting if specified
  if (content.formatting) {
    const formatRequests = applyTextFormatting(placeholders, content.formatting);
    requests.push(...formatRequests);
  }

  return requests;
}

// Apply text formatting to placeholders
function applyTextFormatting(placeholders, formatting) {
  const requests = [];
  
  placeholders.forEach(placeholder => {
    if (placeholder.type === 'TITLE' && formatting.title) {
      requests.push({
        updateTextStyle: {
          objectId: placeholder.objectId,
          style: {
            fontSize: formatting.title.fontSize ? {
              magnitude: formatting.title.fontSize,
              unit: 'PT'
            } : undefined,
            foregroundColor: formatting.title.color ? {
              opaqueColor: {
                rgbColor: parseColor(formatting.title.color)
              }
            } : undefined,
            bold: formatting.title.bold,
            italic: formatting.title.italic
          },
          fields: getUpdateFields(formatting.title)
        }
      });
    }
    
    if (placeholder.type === 'BODY' && formatting.body) {
      requests.push({
        updateTextStyle: {
          objectId: placeholder.objectId,
          style: {
            fontSize: formatting.body.fontSize ? {
              magnitude: formatting.body.fontSize,
              unit: 'PT'
            } : undefined,
            foregroundColor: formatting.body.color ? {
              opaqueColor: {
                rgbColor: parseColor(formatting.body.color)
              }
            } : undefined,
            bold: formatting.body.bold,
            italic: formatting.body.italic
          },
          fields: getUpdateFields(formatting.body)
        }
      });
    }
  });
  
  return requests;
}

// Parse color string to RGB object
function parseColor(colorString) {
  // Handle hex colors
  if (colorString.startsWith('#')) {
    const hex = colorString.slice(1);
    return {
      red: parseInt(hex.substr(0, 2), 16) / 255,
      green: parseInt(hex.substr(2, 2), 16) / 255,
      blue: parseInt(hex.substr(4, 2), 16) / 255
    };
  }
  
  // Handle RGB colors
  const rgbMatch = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return {
      red: parseInt(rgbMatch[1]) / 255,
      green: parseInt(rgbMatch[2]) / 255,
      blue: parseInt(rgbMatch[3]) / 255
    };
  }
  
  // Default to black
  return { red: 0, green: 0, blue: 0 };
}

// Get update fields for text styling
function getUpdateFields(formatOptions) {
  const fields = [];
  if (formatOptions.fontSize) fields.push('fontSize');
  if (formatOptions.color) fields.push('foregroundColor');
  if (formatOptions.bold !== undefined) fields.push('bold');
  if (formatOptions.italic !== undefined) fields.push('italic');
  return fields.join(',');
}

// Generate slide URL
function generateSlideUrl(presentationId, slideId) {
  return `https://docs.google.com/presentation/d/${presentationId}/edit#slide=id.${slideId}`;
}

// Main execution
try {
  const result = await createSlideWithContent();
  
  return {
    success: true,
    slideId: result.slideId,
    slideUrl: generateSlideUrl(deckId, result.slideId),
    presentationId: deckId,
    layoutUsed: {
      objectId: layout.objectId,
      displayName: layout.displayName
    },
    elementsCreated: result.contentRequests.length,
    batchUpdateResponse: result.batchResponse,
    timestamp: new Date().toISOString()
  };
  
} catch (error) {
  return {
    success: false,
    error: error.message,
    presentationId: deckId,
    timestamp: new Date().toISOString()
  };
}