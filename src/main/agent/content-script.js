(function () {
  "use strict";

  if (window.__agentHelpers) {
    console.log("🤖 Agent helpers already injected");
    return;
  }

  function findElement(selector) {
    try {
      // Try CSS selector first, but catch invalid selector syntax
      try {
        let element = document.querySelector(selector);
        if (element) return element;
      } catch (selectorError) {
        // Invalid CSS selector (e.g., :contains() is not valid), continue to fallback methods
        console.debug('Invalid CSS selector, trying fallback methods:', selector);
      }

      if (selector.startsWith("#")) {
        const element = document.getElementById(selector.substring(1));
        if (element) return element;
      }

      if (selector.startsWith("//")) {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const element = result.singleNodeValue;
        if (element) return element;
      }

      // Try XPath text search
      try {
        const textSelector = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${selector.toLowerCase().replace(/'/g, "''")}')]`;
        const textResult = document.evaluate(
          textSelector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const element = textResult.singleNodeValue;
        if (element) return element;
      } catch (xpathError) {
        // XPath failed, continue to other methods
      }

      // Try attribute selectors (with error handling)
      try {
        const element = document.querySelector(`[aria-label*="${selector}" i]`);
        if (element) return element;
      } catch (e) {
        // Invalid selector, continue
      }

      try {
        const element = document.querySelector(`[placeholder*="${selector}" i]`);
        if (element) return element;
      } catch (e) {
        // Invalid selector, continue
      }

      // Try text-based search on buttons
      const buttons = Array.from(
        document.querySelectorAll('button, [role="button"]')
      );
      const buttonElement = buttons.find((btn) =>
        btn.textContent.toLowerCase().includes(selector.toLowerCase())
      );
      if (buttonElement) return buttonElement;

      // Try text-based search on links
      const links = Array.from(document.querySelectorAll("a"));
      const linkElement = links.find((link) =>
        link.textContent.toLowerCase().includes(selector.toLowerCase())
      );
      if (linkElement) return linkElement;

      return null;
    } catch (error) {
      console.error("Error finding element:", error);
      return null;
    }
  }

  function findElements(selector) {
    try {
      // Try CSS selector first, but catch invalid selector syntax
      try {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements);
      } catch (selectorError) {
        // Invalid CSS selector, return empty array
        console.debug('Invalid CSS selector for findElements, returning empty array:', selector);
        return [];
      }
    } catch (error) {
      console.error("Error finding elements:", error);
      return [];
    }
  }

  function highlightElement(element) {
    const original = {
      border: element.style.border,
      outline: element.style.outline,
      backgroundColor: element.style.backgroundColor,
    };

    element.style.border = "3px solid #ff0000";
    element.style.outline = "2px solid #ffffff";
    element.style.backgroundColor = "rgba(255, 0, 0, 0.1)";

    setTimeout(() => {
      element.style.border = original.border;
      element.style.outline = original.outline;
      element.style.backgroundColor = original.backgroundColor;
    }, 800);
  }

  function scrollIntoView(element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }

  function click(selector) {
    const element = findElement(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    try {
      scrollIntoView(element);
      highlightElement(element);

      setTimeout(() => {
        element.click();

        const mouseEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        element.dispatchEvent(mouseEvent);
      }, 300);

      return {
        success: true,
        element: element.tagName,
        text: element.textContent?.trim().substring(0, 50),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function type(selector, text, clear = false) {
    const element = findElement(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    try {
      scrollIntoView(element);
      highlightElement(element);

      element.focus();

      if (clear) {
        element.value = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }

      const chars = text.split("");
      let currentIndex = 0;

      const typeNextChar = () => {
        if (currentIndex >= chars.length) {
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));
          return;
        }

        const char = chars[currentIndex];

        const keydownEvent = new KeyboardEvent("keydown", {
          key: char,
          bubbles: true,
        });
        element.dispatchEvent(keydownEvent);

        element.value += char;

        const inputEvent = new Event("input", { bubbles: true });
        element.dispatchEvent(inputEvent);

        const keypressEvent = new KeyboardEvent("keypress", {
          key: char,
          bubbles: true,
        });
        element.dispatchEvent(keypressEvent);

        const keyupEvent = new KeyboardEvent("keyup", {
          key: char,
          bubbles: true,
        });
        element.dispatchEvent(keyupEvent);

        currentIndex++;

        const delay = 30 + Math.random() * 50;
        setTimeout(typeNextChar, delay);
      };

      typeNextChar();

      return { success: true, text: text.substring(0, 50) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function selectOption(selector, value) {
    const element = findElement(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    try {
      scrollIntoView(element);
      highlightElement(element);

      element.value = value;

      if (element.value !== value) {
        const options = Array.from(element.options || []);
        const option = options.find(
          (opt) =>
            opt.text.toLowerCase().includes(value.toLowerCase()) ||
            opt.value.toLowerCase().includes(value.toLowerCase())
        );

        if (option) {
          element.value = option.value;
        }
      }

      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      return { success: true, selected: element.value };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function hover(selector) {
    const element = findElement(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    try {
      scrollIntoView(element);

      const mouseenterEvent = new MouseEvent("mouseenter", { bubbles: true });
      element.dispatchEvent(mouseenterEvent);

      const mouseoverEvent = new MouseEvent("mouseover", { bubbles: true });
      element.dispatchEvent(mouseoverEvent);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function scroll(direction, amount) {
    try {
      if (direction === "down") {
        window.scrollBy({ top: amount || 300, behavior: "smooth" });
      } else if (direction === "up") {
        window.scrollBy({ top: -(amount || 300), behavior: "smooth" });
      } else if (direction === "to") {
        window.scrollTo({ top: amount || 0, behavior: "smooth" });
      } else if (direction === "toElement") {
        const element = findElement(amount);
        if (element) {
          scrollIntoView(element);
        } else {
          return { success: false, error: `Element not found: ${amount}` };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function getText(selector) {
    const element = findElement(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    return {
      success: true,
      text: element.textContent?.trim() || "",
    };
  }

  function getAttribute(selector, attribute) {
    const element = findElement(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    return {
      success: true,
      value: element.getAttribute(attribute),
    };
  }

  function extractData(schema) {
    const results = {};

    try {
      for (const [key, config] of Object.entries(schema)) {
        if (!config.selector) continue;

        if (config.multiple) {
          // findElements already handles invalid selectors gracefully
          const elements = findElements(config.selector);
          results[key] = elements
            .map((el) => extractValue(el, config.type))
            .filter((v) => v);
        } else {
          // findElement already handles invalid selectors gracefully
          const element = findElement(config.selector);
          if (element) {
            results[key] = extractValue(element, config.type);
          }
        }
      }

      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function extractValue(element, type) {
    switch (type) {
      case "text":
        return element.textContent?.trim();
      case "number":
        const text = element.textContent?.trim() || "";
        const num = parseFloat(text.replace(/[^0-9.-]/g, ""));
        return isNaN(num) ? null : num;
      case "url":
        return element.href || element.src;
      case "image":
        return element.src || element.getAttribute("data-src");
      case "html":
        return element.innerHTML;
      default:
        return element.textContent?.trim();
    }
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const element = findElement(selector);
      if (element) {
        resolve({ success: true, found: true });
        return;
      }

      const startTime = Date.now();
      const checkInterval = 100;

      const interval = setInterval(() => {
        const el = findElement(selector);

        if (el) {
          clearInterval(interval);
          resolve({ success: true, found: true });
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          resolve({
            success: false,
            error: `Timeout waiting for element: ${selector}`,
          });
        }
      }, checkInterval);
    });
  }

  function waitForIdle(timeout = 3000) {
    return new Promise((resolve) => {
      let idleTimer;

      const resetTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          resolve({ success: true });
        }, timeout);
      };

      const events = ["load", "DOMContentLoaded", "readystatechange"];
      events.forEach((event) => {
        window.addEventListener(event, resetTimer, { once: true });
      });

      resetTimer();
    });
  }

  function getInteractiveElements() {
    const elements = [];
    const interactiveTags = ["a", "button", "input", "select", "textarea"];
    const interactiveRoles = [
      "button",
      "link",
      "textbox",
      "searchbox",
      "combobox",
    ];

    document.querySelectorAll("*").forEach((el, index) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const isClickable =
        el.onclick ||
        el.hasAttribute("onclick") ||
        window.getComputedStyle(el).cursor === "pointer";

      const rect = el.getBoundingClientRect();
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        window.getComputedStyle(el).display !== "none" &&
        window.getComputedStyle(el).visibility !== "hidden";

      if (!isVisible) return;

      if (
        interactiveTags.includes(tag) ||
        (role && interactiveRoles.includes(role)) ||
        isClickable
      ) {
        let selector = tag;
        if (el.id) {
          selector = "#" + el.id;
        } else if (el.className) {
          const classes = el.className
            .split(" ")
            .filter((c) => c && !c.includes("["))
            .join(".");
          if (classes) selector = tag + "." + classes;
        }

        elements.push({
          tag: tag,
          id: el.id || undefined,
          class: el.className || undefined,
          text: el.textContent?.trim().substring(0, 100) || undefined,
          type: el.type || undefined,
          name: el.name || undefined,
          placeholder: el.placeholder || undefined,
          href: el.href || undefined,
          ariaLabel: el.getAttribute("aria-label") || undefined,
          selector: selector,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    });

    return elements.slice(0, 200);
  }

  function getPageInfo() {
    return {
      title: document.title,
      url: window.location.href,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
      readyState: document.readyState,
      forms: document.forms.length,
      links: document.links.length,
      images: document.images.length,
      hasNavigation: !!document.querySelector("nav"),
      hasHeader: !!document.querySelector("header"),
      hasFooter: !!document.querySelector("footer"),
      hasSidebar: !!document.querySelector('aside, [role="complementary"]'),
    };
  }

  window.__agentHelpers = {
    findElement,
    findElements,
    click,
    type,
    select: selectOption,
    hover,
    scroll,
    getText,
    getAttribute,
    extractData,
    waitForElement,
    waitForIdle,
    getInteractiveElements,
    getPageInfo,
    highlightElement,
    scrollIntoView,
    version: "1.0.0",
  };

  console.log("🤖 Agent helper script injected successfully (v1.0.0)");
})();
