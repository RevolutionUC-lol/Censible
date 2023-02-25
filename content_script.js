let cachedTerms = [];
const elementsWithTextContentToSearch = "a, p, h1, h2, h3, h4, h5, h6";
const containerElements = "span, div, li, th, td, dt, dd";

// Every time a page is loaded, check our spoil terms and block,
// after making sure settings allow blocking on this page.
chrome.storage.sync.get(null, (result) => {
  // Don't manipulate page if blocking is snoozed
  if (result.isSnoozeOn && !isSnoozeTimeUp(result.timeToUnsnooze)) {
    return;
  }
  // Don't manipulate page if user hasn't entered any terms
  if (!result.spoilerterms) {
    return;
  }

  enableMutationObserver();

  cachedTerms = result.spoilerterms;
  blockSpoilerText(document, result.spoilerterms, "[text replaced by Censible]");
  blockSpoilerImages(document, result.spoilerterms, blurType);
});

// This is a duplicate method. I don't know how to have utility scripts shared
// by both the content script and the popup script.
function isSnoozeTimeUp(timeToUnsnooze) {
  const now = new Date();
  const isPastSnoozeTime = now.getTime() > timeToUnsnooze;
  return isPastSnoozeTime;
}

function blockSpoilerText(rootNode, spoilerTerms, blockText) {
  // Search innerHTML elements first
  let nodes = rootNode.querySelectorAll(elementsWithTextContentToSearch)
  replacenodesWithMatchingText(nodes, spoilerTerms, blockText);

  // Now find any container elements that have just text inside them
  nodes = findContainersWithTextInside(rootNode);
  if (nodes && nodes.length !== 0) {
    replacenodesWithMatchingText(nodes, spoilerTerms, blockText);
  }
}

function blockSpoilerImages(document, spoilerTerms, blurType){
  let images = document.querySelectorAll(img);

  for (const image of images) {
    if(compareForSpoiler(detectLabels(spoilerTerms, imgHref), spoilerTerms))
      image.style = blurType;
      node.parentNode.style.overflow = "hidden";
  }
}

function getUrlsFromImages(images){
  let urls;
  images.forEach(image => urls.Add(getUrlFromImage(image)));
}

//Gets img src or css content src
function getUrlFromImage(image){
  let url;
  if(image.src == null || image.src == ""){
    url = [...document.querySelectorAll('img')].reduce((result, elm) => {

      // get the computed style object.
      const cs = window.getComputedStyle(elm);

      // access the computed `content` value.
      const value = cs.getPropertyValue('content');

      // test for and capture the image's source.
      //  - [https://regex101.com/r/j7nccT/3]
      const src = (/^url\((?<src>.+)\)$/)
        .exec(value)?.groups?.src ?? null;

      if (src !== null) {
        result.push({
          // create an object of element reference and source.
          elm,
          src: src
            // remove possible leading single/double quote.
            .replace(/^['"]/, '')
            // remove possible trailing single/double quote.
            .replace(/['"]$/, '')
        });
      }
      return result;

    }, [])
  }
  else{
    url = image.src;
  }
  return url;
}

async function detectLabels(imgHref) {
  // Imports the Google Cloud client library
  const vision = require('@google-cloud/vision');
  // Creates a client
  const client = new vision.ImageAnnotatorClient();
  // Performs label detection on the image file
  const [result] = await client.labelDetection(imgHref);
  const labels =  result.labelAnnotations;
  console.log('Labels:');
  labels.forEach(label => console.log(label.description));
  return labels;
}

function replacenodesWithMatchingText(nodes, spoilerTerms, replaceString) {
  nodes = Array.from(nodes);
  nodes.reverse();
  for (const node of nodes) {
    for (const spoilerTerm of spoilerTerms) {
      if (compareForSpoiler(node, spoilerTerm)) {
        if (!node.parentNode || node.parentNode.nodeName === "BODY") {
          // ignore top-most node in DOM to avoid stomping entire DOM
          // see issue #16 for more info
          continue;
        }
        node.className += " hidden-spoiler";
        node.textContent = replaceString;
      }
    }
  }
}

function compareForSpoiler(nodeToCheck, spoilerTerm) {
  const regex = new RegExp(spoilerTerm, "i");
  return regex.test(nodeToCheck.textContent);
}

function blurNearestChildrenImages(nodeToCheck) {
  // Traverse up a level and look for images, keep going until either
  // an image is found or the top of the DOM is reached.
  // This has a known side effect of blurring ALL images on the page
  // if an early spoiler is found, but ideally will catch the nearest images
  let nextParent = nodeToCheck;
  let childImages;
  const maxIterations = 3;
  let iterationCount = 0;
  do {
    nextParent = nextParent.parentNode;
    if (nextParent && nextParent.nodeName !== "BODY") {
      childImages = nextParent.parentNode.querySelectorAll('img');
    }
    iterationCount++;
  } while (nextParent && childImages.length === 0 && iterationCount < maxIterations)

  // Now blur all of those images found under the parent node
  if (childImages && childImages.length > 0) {
    for (const image of childImages) {
      image.className += " blacked-out";
    }
  }
}

function findContainersWithTextInside(targetNode) {
  const containerNodes = targetNode.querySelectorAll(containerElements);
  const emptyNodes = [];
  for (const containerNode of containerNodes) {
    const containerChildren = containerNode.childNodes;
    for (const containerChild of containerChildren) {
      if (containerChild.textContent) {
        emptyNodes.push(containerChild.parentNode);
      }
    }
  }
  return emptyNodes;
}

function applyBlurCSSToMatchingImages(nodes, spoilerTerms) {
  for (const node of nodes) {
    for (const spoilerTerm of spoilerTerms) {
      const regex = new RegExp(spoilerTerm, "i");
      if (regex.test(node.title) || regex.test(node.alt ||
        regex.test(node.src) || regex.test(node.name))) {
        node.className += " blurred";
        node.parentNode.style.overflow = "hidden";
      }
    }
  }
}

function enableMutationObserver() {
  // Detecting changed content using Mutation Observers
  //
  // https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver?redirectlocale=en-US&redirectslug=DOM%2FMutationObserver
  // https://hacks.mozilla.org/2012/05/dom-mutationobserver-reacting-to-dom-changes-without-killing-browser-performance/
  MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

  const observer = new MutationObserver((mutations, observer) => {
    // fired when a mutation occurs
    // console.log(mutations, observer);
    for (const mutation of mutations) {
      blockSpoilerContent(mutation.target, cachedTerms, "[text overridden by Censible]");
    }
  });

  // configuration of the observer:
  const config = { attributes: true, subtree: true }
  // turn on the observer...unfortunately we target the entire document
  observer.observe(document, config);
  // disconnecting likely won't work since we need to continuously watch
  // observer.disconnect();
}