/**
 * Layout Analyzer for Google Slides
 * Extracts and analyzes slide layouts and placeholders
 */

class LayoutAnalyzer {
  /**
   * Extract all available layouts from a presentation
   * @param {Object} presentation - Presentation data from Google Slides API
   * @returns {Array} Array of layout objects with metadata
   */
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
        placeholders: this.extractPlaceholders(layout),
        score: 0 // Will be calculated during matching
      };
      
      layouts.push(layoutInfo);
    });

    return layouts;
  }

  /**
   * Extract placeholders from a layout
   * @param {Object} layout - Layout object from Google Slides API
   * @returns {Array} Array of placeholder objects
   */
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
          } : null,
          parentObjectId: element.shape.placeholder.parentObjectId
        };
        
        placeholders.push(placeholder);
      }
    });

    return placeholders;
  }

  /**
   * Categorize layouts based on their placeholders
   * @param {Array} layouts - Array of layout objects
   * @returns {Object} Categorized layouts
   */
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

  /**
   * Determine layout category based on placeholder types
   * @param {Array} placeholderTypes - Array of placeholder type strings
   * @param {string} displayName - Layout display name
   * @returns {string} Category name
   */
  static determineLayoutCategory(placeholderTypes, displayName = '') {
    const nameUpper = displayName.toUpperCase();
    
    // Check display name first for explicit categorization
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

    // Analyze placeholder types
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

  /**
   * Get layout statistics for debugging
   * @param {Array} layouts - Array of layout objects
   * @returns {Object} Layout statistics
   */
  static getLayoutStats(layouts) {
    const categories = this.categorizeLayouts(layouts);
    const stats = {
      total: layouts.length,
      categories: {},
      placeholderTypes: new Set()
    };

    Object.keys(categories).forEach(category => {
      stats.categories[category] = categories[category].length;
    });

    layouts.forEach(layout => {
      layout.placeholders.forEach(placeholder => {
        stats.placeholderTypes.add(placeholder.type);
      });
    });

    stats.placeholderTypes = Array.from(stats.placeholderTypes);
    return stats;
  }
}

// Export for n8n usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LayoutAnalyzer;
} else {
  // For n8n Function node
  this.LayoutAnalyzer = LayoutAnalyzer;
}