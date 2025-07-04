/**
 * n8n Function Node: Extract Presentation Layouts
 * 
 * This function retrieves a Google Slides presentation and extracts
 * all available layouts with their placeholders and metadata.
 * 
 * Expected input: $json with 'deckId' property
 * Required credentials: Google OAuth2 API in n8n
 */

// Get OAuth2 access token from n8n credentials
const credentials = await this.getCredentials('googleOAuth2Api');
const accessToken = credentials.access_token;

// Get input data
const deckId = $json.deckId;
if (!deckId) {
  throw new Error('deckId is required in input data');
}

// SlidesClient class (inline for n8n)
class SlidesClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://slides.googleapis.com/v1';
  }

  async getPresentation(presentationId) {
    const response = await $request({
      method: 'GET',
      url: `${this.baseUrl}/presentations/${presentationId}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      json: true
    });
    return response;
  }
}

// LayoutAnalyzer class (inline for n8n)
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
        const placeholder = {
          objectId: element.objectId,
          type: element.shape.placeholder.type,
          index: element.shape.placeholder.index,
          bounds: element.size && element.transform ? {
            x: element.transform.translateX || 0,
            y: element.transform.translateY || 0,
            width: element.size.width?.magnitude || 0,
            height: element.size.height?.magnitude || 0
          } : null
        };
        
        placeholders.push(placeholder);
      }
    });

    return placeholders;
  }

  static categorizeLayouts(layouts) {
    const categories = {
      titleOnly: [],
      titleAndBody: [],
      titleAndTwoColumns: [],
      sectionHeader: [],
      blank: [],
      other: []
    };

    layouts.forEach(layout => {
      const placeholderTypes = layout.placeholders.map(p => p.type);
      const category = this.determineLayoutCategory(placeholderTypes, layout.displayName);
      
      if (categories[category]) {
        categories[category].push(layout);
      } else {
        categories.other.push(layout);
      }
    });

    return categories;
  }

  static determineLayoutCategory(placeholderTypes, displayName = '') {
    const nameUpper = displayName.toUpperCase();
    
    if (nameUpper.includes('TITLE_ONLY') || nameUpper.includes('TITLE ONLY')) {
      return 'titleOnly';
    }
    if (nameUpper.includes('SECTION_HEADER') || nameUpper.includes('SECTION HEADER')) {
      return 'sectionHeader';
    }
    if (nameUpper.includes('TWO_COLUMNS') || nameUpper.includes('TWO COLUMNS')) {
      return 'titleAndTwoColumns';
    }
    if (nameUpper.includes('BLANK')) {
      return 'blank';
    }

    const hasTitle = placeholderTypes.includes('TITLE') || placeholderTypes.includes('CENTERED_TITLE');
    const hasBody = placeholderTypes.includes('BODY') || placeholderTypes.includes('SUBTITLE');
    const hasContent = placeholderTypes.includes('CONTENT');
    const bodyCount = placeholderTypes.filter(type => 
      type === 'BODY' || type === 'CONTENT' || type === 'SUBTITLE'
    ).length;

    if (hasTitle && !hasBody && !hasContent) {
      return 'titleOnly';
    }
    if (hasTitle && (hasBody || hasContent) && bodyCount === 1) {
      return 'titleAndBody';
    }
    if (hasTitle && bodyCount >= 2) {
      return 'titleAndTwoColumns';
    }
    if (hasTitle && placeholderTypes.includes('SUBTITLE')) {
      return 'sectionHeader';
    }
    if (placeholderTypes.length === 0) {
      return 'blank';
    }

    return 'other';
  }
}

// Main execution
try {
  const client = new SlidesClient(accessToken);
  const presentation = await client.getPresentation(deckId);
  
  const layouts = LayoutAnalyzer.extractLayouts(presentation);
  const categorizedLayouts = LayoutAnalyzer.categorizeLayouts(layouts);
  
  return {
    success: true,
    presentationId: deckId,
    presentationTitle: presentation.title,
    layouts: layouts,
    categorizedLayouts: categorizedLayouts,
    stats: {
      totalLayouts: layouts.length,
      categoryCounts: Object.keys(categorizedLayouts).reduce((acc, key) => {
        acc[key] = categorizedLayouts[key].length;
        return acc;
      }, {})
    },
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