// Função que contém toda a lógica de rastreamento
// Function that contains all the tracking logic
function initializeTrackingScript(window) {
  "use strict";

  const {
    screen: { width: screenWidth, height: screenHeight },
    navigator: { language: userLanguage },
    location: location,
    localStorage: localStorage,
    document: document,
    history: history,
  } = window;

  const { hostname: hostname, href: pageUrl } = location;
  const { currentScript: currentScript, referrer: referrer } = document;

  // Verifica se o script atual existe
  // Checks if the current script exists
  if (!currentScript) return;

  // Prefixo usado para obter atributos do script
  // Prefix used to get script attributes
  const dataPrefix = "data-";

  // Função para obter o valor de um atributo do script
  // Function to get the value of a script attribute
  const getAttribute = currentScript.getAttribute.bind(currentScript);

  // Obtém alguns valores do script
  // Gets some values from the script
  const websiteId = getAttribute(dataPrefix + "website-id"),
    hostUrl = getAttribute(dataPrefix + "host-url"),
    tag = getAttribute(dataPrefix + "tag"),
    autoTrack = "false" !== getAttribute(dataPrefix + "auto-track"),
    excludeSearch = "true" === getAttribute(dataPrefix + "exclude-search"),
    domains = getAttribute(dataPrefix + "domains") || "";

  // Concatena a URL da API
  // Concatenates the API URL
  const apiUrl = `${(
    hostUrl ||
    "" ||
    currentScript.src.split("/").slice(0, -1).join("/")
  ).replace(/\/$/, "")}/api/send`;

  // Obtém a resolução da tela
  // Gets the screen resolution
  const screenResolution = `${screenWidth}x${screenHeight}`;

  // Expressão regular para eventos
  // Regular expression for events
  const eventRegex = /data-umami-event-([\w-_]+)/;

  // Nome do atributo do evento
  // Name of the event attribute
  const umamiEventAttribute = dataPrefix + "umami-event";

  // Intervalo para debouncing
  // Debouncing interval
  const debouncingInterval = 300;

  // Função para codificar ou decodificar a URL
  // Function to encode or decode the URL
  const encodeOrDecodeURI = (url) => {
    if (url) {
      try {
        const decodedUrl = decodeURI(url);
        if (decodedUrl !== url) return decodedUrl;
      } catch (e) {
        return url;
      }
      return encodeURI(url);
    }
  };

  // Função para limpar a URL, removendo parâmetros de pesquisa, se necessário
  // Function to clean the URL, removing search parameters if necessary
  const cleanUrl = (url) => {
    try {
      const { pathname, search } = new URL(url);
      url = pathname + search;
    } catch (e) {}
    return excludeSearch ? url.split("?")[0] : url;
  };

  // Função para obter informações do site
  // Function to get website information
  const getWebsiteInfo = () => ({
    websiteId,
    hostname,
    screenResolution,
    userLanguage,
    pageTitle: encodeOrDecodeURI(pageTitle),
    currentUrl: encodeOrDecodeURI(currentUrl),
    referrer: encodeOrDecodeURI(referrerUrl),
    tag: tag || undefined,
  });

  // Função para gerenciar mudanças no histórico
  // Function to manage history changes
  const handleHistoryChange = (state, type, url) => {
    if (
      url &&
      ((currentUrl = cleanUrl(url.toString())), currentUrl !== previousUrl)
    ) {
      setTimeout(sendTrackingData, debouncingInterval);
    }
  };

  // Verifica se o rastreamento deve ser desativado
  // Checks if tracking should be disabled
  const shouldDisableTracking = () =>
    !websiteId ||
    (localStorage && localStorage.getItem("umami.disabled")) ||
    (domains && !allowedDomains.includes(hostname));

  // Função para enviar dados para a API
  // Function to send data to the API
  const sendTrackingData = async (eventData, eventType = "event") => {
    if (shouldDisableTracking()) return;
    const headers = { "Content-Type": "application/json" };
    if (cacheKey !== undefined) {
      headers["x-umami-cache"] = cacheKey;
    }
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ type: eventType, payload: eventData }),
        headers,
      });
      const responseText = await response.text();
      return (cacheKey = responseText);
    } catch (error) {}
  };

  // Função para inicializar o rastreamento
  // Function to initialize tracking
  const initializeTracking = () => {
    if (trackingInitialized) return;
    sendTrackingData();
    (() => {
      const wrapHistoryMethod = (obj, method, callback) => {
        const originalMethod = obj[method];
        return (...args) => {
          callback.apply(null, args);
          originalMethod.apply(obj, args);
        };
      };
      history.pushState = wrapHistoryMethod(
        history,
        "pushState",
        handleHistoryChange
      );
      history.replaceState = wrapHistoryMethod(
        history,
        "replaceState",
        handleHistoryChange
      );
    })(),
      (() => {
        const titleObserver = new MutationObserver(([mutation]) => {
          pageTitle =
            mutation && mutation.target ? mutation.target.text : undefined;
        });
        const titleElement = document.querySelector("head > title");
        titleElement &&
          titleObserver.observe(titleElement, {
            subtree: true,
            characterData: true,
            childList: true,
          });
      })(),
      document.addEventListener(
        "click",
        async (event) => {
          const isButtonOrLink = (element) => ["BUTTON", "A"].includes(element);
          const handleElementClick = async (element) => {
            const elementGetAttribute = element.getAttribute.bind(element);
            const umamiEvent = elementGetAttribute(umamiEventAttribute);
            if (umamiEvent) {
              const eventAttributes = {};
              element.getAttributeNames().forEach((attribute) => {
                const match = attribute.match(eventRegex);
                if (match) {
                  eventAttributes[match[1]] = elementGetAttribute(attribute);
                }
              });
              sendTrackingData(umamiEvent, eventAttributes);
            }
          };

          const clickedElement = event.target;
          const closestElement = isButtonOrLink(clickedElement.tagName)
            ? clickedElement
            : (() => {
                let element = event.target;
                for (let i = 0; i < 10; i++) {
                  if (isButtonOrLink(element.tagName)) return element;
                  if (((element = element.parentElement), !element))
                    return null;
                }
              })();

          if (!closestElement) return handleElementClick(clickedElement);
          const { href, target } = closestElement;
          const umamiEvent = closestElement.getAttribute(umamiEventAttribute);
          if (umamiEvent) {
            if ("A" === closestElement.tagName) {
              const openInNewTab =
                "_blank" === target ||
                event.ctrlKey ||
                event.shiftKey ||
                event.metaKey ||
                (event.button && 1 === event.button);
              if (umamiEvent && href) {
                if (openInNewTab) return;
                event.preventDefault();
                handleElementClick(closestElement).then(() => {
                  !openInNewTab && (location.href = href);
                });
              }
            } else if ("BUTTON" === closestElement.tagName) {
              return handleElementClick(closestElement);
            }
          }
        },
        true
      ),
      (trackingInitialized = true);
  };

  // Função para rastrear eventos
  // Function to track events
  const trackEvent = (eventName, eventData) =>
    sendTrackingData(
      typeof eventName === "string"
        ? {
            ...getWebsiteInfo(),
            name: eventName,
            data: typeof eventData === "object" ? eventData : undefined,
          }
        : typeof eventName === "object"
        ? eventName
        : typeof eventName === "function"
        ? eventName(getWebsiteInfo())
        : getWebsiteInfo()
    );

  // Função para identificar usuários
  // Function to identify users
  const identifyUser = (userData) =>
    sendTrackingData({ ...getWebsiteInfo(), data: userData }, "identify");

  // Inicializa o objeto umami
  // Initializes the umami object
  window.umami ||
    (window.umami = { track: trackEvent, identify: identifyUser });

  let cacheKey,
    trackingInitialized,
    currentUrl = cleanUrl(pageUrl),
    previousUrl = referrer !== hostname ? referrer : "",
    pageTitle = document.title;

  // Começa o rastreamento se o auto-track for ativado
  // Starts tracking if auto-track is enabled
  autoTrack &&
    !shouldDisableTracking() &&
    ("complete" === document.readyState
      ? initializeTracking()
      : document.addEventListener(
          "readystatechange",
          initializeTracking,
          true
        ));
}

// Chama a função para inicializar o rastreamento
// Call the function to initialize the trace
initializeTrackingScript(window);
