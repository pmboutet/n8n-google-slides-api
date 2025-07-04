/**
 * n8n Function Node: Complete Slide Creation Workflow
 * 
 * This is an all-in-one function that handles the entire workflow:
 * 1. Extract layouts from presentation
 * 2. Analyze content and select best layout
 * 3. Create slide with content
 * 
 * Expected input: $json with 'deckId' and 'content' properties
 * Required credentials: Google OAuth2 API in n8n
 */

// Get OAuth2 access token from n8n credentials
const credentials = await this.getCredentials('googleOAuth2Api');
const accessToken = credentials.access_token;

// Get input data
const deckId = $json.deckId;
const content = $json.content;
const options = $json.options || {};

if (!deckId) {
  throw new Error('deckId is required in input data');
}
if (!content) {
  throw new Error('content is required in input data');
}

// Helper function to make API requests
async function makeRequest(url, method = 'GET', body = null) {
  const requestOptions = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    json: true
  };

  if (body) {
    requestOptions.body = body;
  }

  return await $request(requestOptions);
}

// Helper function to generate unique IDs
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Layout Analysis Functions
class LayoutAnalyzer {
  static extractLayouts(presentation) {
    const layouts = [];
    
    if (!presentation.layouts) {
      return layouts;
    }

    presentation.layouts.forEach(layout => {
      const layoutInfo = {
        objectId: layout.objectId,
        layoutProperties: layout.layoutProperties,
        displayName: layout.layoutProperties?.displayName || 'Unnamed Layout',
        placeholders: this.extractPlaceholders(layout)
      };
      
      layouts.push(layoutInfo);
    });

    return layouts;
  }

  static extractPlaceholders(layout) {
    const placeholders = [];
    
    if (!layout.pageElements) {
      return placeholders;
    }

    layout.pageElements.forEach(element => {
      if (element.shape && element.shape.placeholder) {
        placeholders.push({
          objectId: element.objectId,
          type: element.shape.placeholder.type,
          index: element.shape.placeholder.index
        });
      }
    });

    return placeholders;
  }
}

// Content Matching Functions
class ContentMatcher {
  static findBestLayout(content, layouts) {
    if (!layouts || layouts.length === 0) {
      throw new Error('No layouts available');
    }

    const contentAnalysis = this.analyzeContent(content);
    const scoredLayouts = layouts.map(layout => ({
      ...layout,
      score: this.calculateLayoutScore(contentAnalysis, layout)
    }));

    scoredLayouts.sort((a, b) => b.score - a.score);
    
    return {
      bestLayout: scoredLayouts[0],
      contentAnalysis,
      reasoning: this.generateReasoning(contentAnalysis, scoredLayouts[0])
    };
  }

  static analyzeContent(content) {
    return {
      hasTitle: Boolean(content.title && content.title.trim()),
      hasBody: Boolean(content.body && content.body.trim()),
      hasImage: Boolean(content.imageUrl || content.images?.length),
      hasBullets: Boolean(content.bullets?.length),
      contentLength: (content.body || '').length > 300 ? 'long' : 'short',
      contentType: this.determineContentType(content)
    };
  }

  static determineContentType(content) {
    const title = (content.title || '').toLowerCase();
    const body = (content.body || '').toLowerCase();
    
    if (title.includes('agenda')) return 'agenda';
    if (title.includes('quote') || body.includes('"')) return 'quote';
    if (title.includes('section')) return 'section';
    if (content.imageUrl && !content.body) return 'image-focused';
    if (content.bullets && content.bullets.length > 3) return 'list-heavy';
    if (title.includes('vs') || title.includes('comparison')) return 'comparison';
    
    return 'general';
  }

  static calculateLayoutScore(analysis, layout) {
    let score = 30; // base score
    const placeholders = layout.placeholders.map(p => p.type);
    
    // Title matching
    if (analysis.hasTitle && placeholders.includes('TITLE')) {
      score += 25;
    } else if (analysis.hasTitle && !placeholders.includes('TITLE')) {
      score -= 10;
    }
    
    // Body matching
    if (analysis.hasBody && placeholders.includes('BODY')) {
      score += 20;
    } else if (analysis.hasBody && !placeholders.includes('BODY')) {
      score -= 10;
    }
    
    // Image matching
    if (analysis.hasImage && placeholders.includes('PICTURE')) {
      score += 15;
    }
    
    // Content type bonuses
    const displayName = layout.displayName.toUpperCase();
    if (analysis.contentType === 'section' && displayName.includes('SECTION')) {
      score += 20;
    }
    if (analysis.contentType === 'comparison' && displayName.includes('TWO')) {
      score += 15;
    }
    
    return Math.max(0, score);
  }

  static generateReasoning(analysis, layout) {
    const reasons = [];
    if (analysis.hasTitle) reasons.push('Has title content');
    if (analysis.hasBody) reasons.push('Has body content');
    if (analysis.hasImage) reasons.push('Has image content');
    reasons.push(`Content type: ${analysis.contentType}`);
    reasons.push(`Layout: ${layout.displayName}`);
    reasons.push(`Score: ${layout.score}`);
    return reasons.join(' | ');
  }
}

// Slide Creation Functions
function prepareSlideRequests(layout, content, slideId) {
  const requests = [];
  
  // Create slide
  requests.push({
    createSlide: {
      objectId: slideId,
      slideLayoutReference: {
        layoutId: layout.objectId
      }
    }
  });

  // Group placeholders by type
  const placeholdersByType = {};
  layout.placeholders.forEach(placeholder => {
    if (!placeholdersByType[placeholder.type]) {
      placeholdersByType[placeholder.type] = [];
    }
    placeholdersByType[placeholder.type].push(placeholder);
  });

  // Insert title
  if (content.title && placeholdersByType.TITLE) {
    requests.push({
      insertText: {
        objectId: placeholdersByType.TITLE[0].objectId,
        text: content.title,
        insertionIndex: 0
      }
    });
  }

  // Insert body content
  if (content.body && placeholdersByType.BODY) {
    let bodyText = content.body;
    
    // Handle bullets
    if (content.bullets && content.bullets.length > 0) {
      bodyText = content.bullets.map(bullet => `• ${bullet}`).join('\n');
    }
    
    requests.push({
      insertText: {
        objectId: placeholdersByType.BODY[0].objectId,
        text: bodyText,
        insertionIndex: 0
      }
    });
  }

  // Insert subtitle
  if (content.subtitle && placeholdersByType.SUBTITLE) {
    requests.push({
      insertText: {
        objectId: placeholdersByType.SUBTITLE[0].objectId,
        text: content.subtitle,
        insertionIndex: 0
      }
    });
  }

  // Replace image
  if (content.imageUrl && placeholdersByType.PICTURE) {
    requests.push({
      replaceImage: {
        imageObjectId: placeholdersByType.PICTURE[0].objectId,
        url: content.imageUrl
      }
    });
  }

  return requests;
}

// Main workflow execution
async function executeCompleteWorkflow() {
  const workflow = {
    step: 1,
    status: 'starting',
    results: {}
  };

  try {
    // Step 1: Get presentation and extract layouts
    workflow.step = 1;
    workflow.status = 'extracting_layouts';
    
    const presentation = await makeRequest(
      `https://slides.googleapis.com/v1/presentations/${deckId}`
    );
    
    const layouts = LayoutAnalyzer.extractLayouts(presentation);
    
    if (layouts.length === 0) {
      throw new Error('No layouts found in presentation');
    }
    
    workflow.results.layoutsFound = layouts.length;
    workflow.results.presentationTitle = presentation.title;

    // Step 2: Analyze content and select layout
    workflow.step = 2;
    workflow.status = 'selecting_layout';
    
    const matchResult = ContentMatcher.findBestLayout(content, layouts);
    const selectedLayout = matchResult.bestLayout;
    
    workflow.results.contentAnalysis = matchResult.contentAnalysis;
    workflow.results.selectedLayout = {
      objectId: selectedLayout.objectId,
      displayName: selectedLayout.displayName,
      score: selectedLayout.score
    };
    workflow.results.reasoning = matchResult.reasoning;

    // Step 3: Create slide with content
    workflow.step = 3;
    workflow.status = 'creating_slide';
    
    const slideId = generateId();
    const requests = prepareSlideRequests(selectedLayout, content, slideId);
    
    const batchResponse = await makeRequest(
      `https://slides.googleapis.com/v1/presentations/${deckId}:batchUpdate`,
      'POST',
      { requests }
    );

    // Step 4: Finalize results
    workflow.step = 4;
    workflow.status = 'completed';
    
    const slideUrl = `https://docs.google.com/presentation/d/${deckId}/edit#slide=id.${slideId}`;
    
    workflow.results.slideCreated = {
      slideId,
      slideUrl,
      elementsCreated: requests.length - 1, // Exclude createSlide request
      batchUpdateSuccess: Boolean(batchResponse.replies)
    };

    return {
      success: true,
      workflow,
      slideId,
      slideUrl,
      presentationId: deckId,
      layoutUsed: selectedLayout.displayName,
      contentAnalysis: matchResult.contentAnalysis,
      reasoning: matchResult.reasoning,
      confidence: selectedLayout.score > 70 ? 'high' : 
                  selectedLayout.score > 40 ? 'medium' : 'low',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,
      workflow,
      error: error.message,
      presentationId: deckId,
      timestamp: new Date().toISOString()
    };
  }
}

// Execute the complete workflow
return await executeCompleteWorkflow();