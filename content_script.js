let cachedTerms = []; 
let cachedBlurPercent;
const elementsWithTextContentToSearch = "a, p, h1, h2, h3, h4, h5, h6";
const containerElements = "span, div, li, th, td, dt, dd";
const key = "AIzaSyC1rWeImHFJnAuB8JiIEMhxK7m6kazptuM";

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
  cachedBlurPercent = result.blurPercent;
  blockSpoilerContent(document, result.spoilerterms, result.blurPercent, "[This Text has been censored by Censible]");
});



// This is a duplicate method. I don't know how to have utility scripts shared
// by both the content script and the popup script.
function isSnoozeTimeUp(timeToUnsnooze) {
  const now = new Date();
  const isPastSnoozeTime = now.getTime() > timeToUnsnooze;
  return isPastSnoozeTime;
}

function blockSpoilerContent(rootNode, spoilerTerms, blurPerc, blockText) {
  // Search innerHTML elements first
  let nodes = rootNode.querySelectorAll(elementsWithTextContentToSearch)
  replacenodesWithMatchingText(nodes, spoilerTerms, blurPerc, blockText);

  // Now find any container elements that have just text inside them
  nodes = findContainersWithTextInside(rootNode);
  if (nodes && nodes.length !== 0) {
    replacenodesWithMatchingText(nodes, spoilerTerms, blurPerc, blockText);
  }

  setSensitiveImagesToBlur(spoilerTerms, blurPerc)
}

function replacenodesWithMatchingText(nodes, spoilerTerms, blurPerc, replaceString) {
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

async function setSensitiveImagesToBlur(spoilerTerms, blurPerc){
  let images = document.getElementsByTagName("img");
  Array.from(images).forEach(async image => {
    var alt = image.alt;
    if(alt != null && altContainsSpoilerTerms(alt, spoilerTerms)){
      applyImageBlur(image, blurPerc);
      return;
    }
    var src = image.src;;
    var response = await getCloudResponse(src);
    let labels = getLabelsFromResponse(response);
    if(listsHaveASharedValue(labels, spoilerTerms)){
      applyImageBlur(image, blurPerc);
    }
  });
}

function altContainsSpoilerTerms(alt, spoilerTerms){
  let altWords = alt.split(" ");
  return listsHaveASharedValue(altWords, spoilerTerms)
}

async function getCloudResponse(src){
  let json = `{
    "requests":[
      {
        "image":{
          "source":{
            "imageUri":"` + src + `"
          }
        },
        "features":[
          {
            "type":"LABEL_DETECTION",
            "maxResults":10
          }
        ]
      }
    ]
  }`;

  const response = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + key, {
    method: 'POST',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    },
    body: json
  });

  return response.json();
}

function getLabelsFromResponse(response){
  let labels = [];
  JSON.parse(JSON.stringify(response),(key, value) =>{  
    if(key == "description")
      labels.push(value);
  });

  return labels;
}

function listsHaveASharedValue(list1, list2){
  list1.forEach(ele1 => {
    list2.forEach(ele2 => {
      if(ele1 === ele2) {
        return true;
      }
    })
  });
  return false;
}

function applyImageBlur(image, blurPerc){
  image.setAttribute('style', 'filter: blur('+blurPerc+'px); -webkit-filter: blur('+blurPerc+'px)');
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
      blockSpoilerContent(mutation.target, cachedTerms, cachedBlurPercent, "[text overridden by Censible]");
    }
  });

  // configuration of the observer:
  const config = { attributes: true, subtree: true }
  // turn on the observer...unfortunately we target the entire document
  observer.observe(document, config);
  // disconnecting likely won't work since we need to continuously watch
  // observer.disconnect();
}
