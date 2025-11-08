import type { Tab } from "../Tab";
import type { SimplifiedDOMNode, ElementLocator } from "./types";

export function getSimplifiedDOM(html: string, maxDepth: number = 5): string {
  try {
    const cleaned = cleanHTML(html);
    const tree = parseHTMLToTree(cleaned, maxDepth);
    return formatTreeForLLM(tree);
  } catch (error) {
    console.error("Error simplifying DOM:", error);
    return "Error: Could not parse DOM";
  }
}

function cleanHTML(html: string): string {
  let cleaned = html;

  cleaned = cleaned.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );

  cleaned = cleaned.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    ""
  );

  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

  return cleaned;
}

function parseHTMLToTree(html: string, maxDepth: number): SimplifiedDOMNode {
  const root: SimplifiedDOMNode = {
    tag: "root",
    children: [],
  };

  return root;
}

function formatTreeForLLM(
  node: SimplifiedDOMNode,
  indent: string = ""
): string {
  const parts: string[] = [];

  let line = `${indent}<${node.tag}`;

  if (node.id) line += ` id="${node.id}"`;
  if (node.class) line += ` class="${node.class}"`;

  if (node.attributes) {
    const importantAttrs = [
      "href",
      "src",
      "type",
      "name",
      "placeholder",
      "value",
      "aria-label",
    ];
    for (const attr of importantAttrs) {
      if (node.attributes[attr]) {
        line += ` ${attr}="${node.attributes[attr]}"`;
      }
    }
  }

  line += ">";

  if (node.text && node.text.trim()) {
    line += ` ${node.text.trim()}`;
  }

  parts.push(line);

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      parts.push(formatTreeForLLM(child, indent + "  "));
    }
  }

  return parts.join("\n");
}

export async function extractInteractiveElements(tab: Tab): Promise<string> {
  const script = `
    (function() {
      const elements = [];
      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
      const interactiveRoles = ['button', 'link', 'textbox', 'searchbox'];
      
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el, index) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const isClickable = el.onclick || el.hasAttribute('onclick');
        
        if (interactiveTags.includes(tag) || 
            (role && interactiveRoles.includes(role)) || 
            isClickable) {
          
          const id = el.id;
          const classes = el.className ? el.className.split(' ').filter(c => c).join('.') : '';
          
          let selector = tag;
          if (id) selector = '#' + id;
          else if (classes) selector = tag + '.' + classes;
          else selector = tag + ':nth-of-type(' + (index + 1) + ')';
          
          elements.push({
            tag: tag,
            id: id || undefined,
            class: el.className || undefined,
            text: el.textContent?.trim().substring(0, 100) || undefined,
            type: el.type || undefined,
            name: el.name || undefined,
            placeholder: el.placeholder || undefined,
            href: el.href || undefined,
            selector: selector,
            visible: el.offsetParent !== null,
          });
        }
      });
      
      return elements.filter(el => el.visible).slice(0, 100);
    })();
  `;

  try {
    const elements = await tab.runJs(script);
    return JSON.stringify(elements, null, 2);
  } catch (error) {
    console.error("Error extracting interactive elements:", error);
    return "[]";
  }
}

export async function injectHelperScript(tab: Tab): Promise<boolean> {
  const helperScript = `
    (function() {
      if (window.__agentHelpers) {
        return true;
      }
      
      window.__agentHelpers = {
        
        findElement: function(selector) {
          try {
            // Try CSS selector first, but handle invalid selectors gracefully
            try {
              let element = document.querySelector(selector);
              if (element) return element;
            } catch (selectorError) {
              // Invalid CSS selector (e.g., :contains() is not valid), try fallback methods
              console.debug('Invalid CSS selector, trying fallback methods:', selector);
            }
            
            if (selector.startsWith('#')) {
              const element = document.getElementById(selector.substring(1));
              if (element) return element;
            }
            
            // Try XPath text search
            try {
              const xpath = \`//\*[contains(text(), '\${selector.replace(/'/g, "''")}')]\`;
              const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              const element = result.singleNodeValue;
              if (element) return element;
            } catch (xpathError) {
              // XPath failed, continue
            }
            
            // Try attribute selector (with error handling)
            try {
              const element = document.querySelector(\`[\${selector}]\`);
              if (element) return element;
            } catch (e) {
              // Invalid selector, continue
            }
            
            // Try text-based search on buttons
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            const btn = buttons.find(b => b.textContent && b.textContent.toLowerCase().includes(selector.toLowerCase()));
            if (btn) return btn;
            
            return null;
          } catch (error) {
            console.error('Error finding element:', error);
            return null;
          }
        },
        
        click: function(selector) {
          const element = this.findElement(selector);
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const originalBorder = element.style.border;
            element.style.border = '2px solid red';
            setTimeout(() => { element.style.border = originalBorder; }, 500);
            
            element.click();
            
            return { success: true, element: element.tagName };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        
        type: function(selector, text, clear = false) {
          const element = this.findElement(selector);
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            element.focus();
            
            if (clear) {
              element.value = '';
            }
            
            const chars = text.split('');
            let currentValue = element.value || '';
            
            chars.forEach((char, index) => {
              setTimeout(() => {
                currentValue += char;
                element.value = currentValue;
                
                const event = new Event('input', { bubbles: true });
                element.dispatchEvent(event);
              }, index * 50);
            });
            
            setTimeout(() => {
              const changeEvent = new Event('change', { bubbles: true });
              element.dispatchEvent(changeEvent);
            }, chars.length * 50 + 100);
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        
        select: function(selector, value) {
          const element = this.findElement(selector);
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          try {
            element.value = value;
            const event = new Event('change', { bubbles: true });
            element.dispatchEvent(event);
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        
        hover: function(selector) {
          const element = this.findElement(selector);
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const event = new MouseEvent('mouseenter', { bubbles: true });
            element.dispatchEvent(event);
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        
        scroll: function(direction, amount = 300) {
          try {
            if (direction === 'down') {
              window.scrollBy({ top: amount, behavior: 'smooth' });
            } else if (direction === 'up') {
              window.scrollBy({ top: -amount, behavior: 'smooth' });
            } else if (direction === 'to') {
              window.scrollTo({ top: amount, behavior: 'smooth' });
            }
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        
        waitForElement: function(selector, timeout = 5000) {
          return new Promise((resolve) => {
            const element = this.findElement(selector);
            if (element) {
              resolve({ success: true, found: true });
              return;
            }
            
            const startTime = Date.now();
            const interval = setInterval(() => {
              const el = this.findElement(selector);
              if (el) {
                clearInterval(interval);
                resolve({ success: true, found: true });
              } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                resolve({ success: false, error: 'Timeout waiting for element' });
              }
            }, 100);
          });
        },
        
        getText: function(selector) {
          const element = this.findElement(selector);
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          return { 
            success: true, 
            text: element.textContent?.trim() || '' 
          };
        },
        
        getAttribute: function(selector, attribute) {
          const element = this.findElement(selector);
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          return { 
            success: true, 
            value: element.getAttribute(attribute) 
          };
        },
        
        extractData: function(schema) {
          const results = {};
          
          for (const [key, config] of Object.entries(schema)) {
            if (!config.selector) continue;
            
            if (config.multiple) {
              // Try querySelectorAll, but handle invalid selectors gracefully
              let elements = [];
              try {
                elements = Array.from(document.querySelectorAll(config.selector));
              } catch (selectorError) {
                // Invalid CSS selector, try using findElement in a loop
                console.debug('Invalid CSS selector for extractData, trying fallback:', config.selector);
                // For multiple elements, we can't easily use findElement, so return empty array
                results[key] = [];
                continue;
              }
              
              results[key] = elements.map(el => {
                if (config.type === 'text') return el.textContent?.trim();
                if (config.type === 'url') return el.href;
                if (config.type === 'image') return el.src;
                return el.textContent?.trim();
              });
            } else {
              const element = this.findElement(config.selector);
              if (element) {
                if (config.type === 'text') results[key] = element.textContent?.trim();
                else if (config.type === 'url') results[key] = element.href;
                else if (config.type === 'image') results[key] = element.src;
                else results[key] = element.textContent?.trim();
              }
            }
          }
          
          return { success: true, data: results };
        }
      };
      
      console.log('🤖 Agent helper script injected successfully');
      return true;
    })();
  `;

  try {
    const result = await tab.runJs(helperScript);
    return result === true;
  } catch (error) {
    console.error("Error injecting helper script:", error);
    return false;
  }
}

export async function isHelperScriptInjected(tab: Tab): Promise<boolean> {
  try {
    const result = await tab.runJs(
      "typeof window.__agentHelpers !== 'undefined'"
    );
    return result === true;
  } catch (error) {
    return false;
  }
}

export function generateSelector(description: string): ElementLocator {
  if (description.startsWith("#")) {
    return { strategy: "id", value: description.substring(1) };
  }

  if (description.startsWith(".")) {
    return { strategy: "class", value: description.substring(1) };
  }

  if (description.startsWith("//") || description.startsWith("(//")) {
    return { strategy: "xpath", value: description };
  }

  if (!description.includes("[") && !description.includes(">")) {
    return { strategy: "text", value: description };
  }

  return { strategy: "css", value: description };
}

export async function getElementCoordinates(
  tab: Tab,
  selector: string
): Promise<{ x: number; y: number } | null> {
  const script = `
    (function() {
      const element = window.__agentHelpers?.findElement('${selector}');
      if (!element) return null;
      
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    })();
  `;

  try {
    return await tab.runJs(script);
  } catch (error) {
    console.error("Error getting element coordinates:", error);
    return null;
  }
}

export async function analyzePage(tab: Tab): Promise<string> {
  const script = `
    (function() {
      const analysis = {
        title: document.title,
        url: window.location.href,
        forms: document.forms.length,
        links: document.links.length,
        images: document.images.length,
        inputs: document.querySelectorAll('input').length,
        buttons: document.querySelectorAll('button').length,
        hasNavigation: !!document.querySelector('nav'),
        hasHeader: !!document.querySelector('header'),
        hasFooter: !!document.querySelector('footer'),
        mainContent: document.querySelector('main')?.textContent?.substring(0, 200) || '',
      };
      
      return analysis;
    })();
  `;

  try {
    const analysis = await tab.runJs(script);
    return JSON.stringify(analysis, null, 2);
  } catch (error) {
    console.error("Error analyzing page:", error);
    return "{}";
  }
}

export async function screenshotElement(
  tab: Tab,
  selector: string
): Promise<string | null> {
  const scrollScript = `
    (function() {
      const element = window.__agentHelpers?.findElement('${selector}');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return false;
    })();
  `;

  try {
    await tab.runJs(scrollScript);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const image = await tab.screenshot();
    return image.toDataURL();
  } catch (error) {
    console.error("Error taking element screenshot:", error);
    return null;
  }
}
