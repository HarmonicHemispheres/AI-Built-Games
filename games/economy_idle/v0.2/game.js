const initialCash = 500;
let cash = initialCash;
let selectedTileIndex = 0;
let upgradeCount = 0;
let manufacturingUpgradeCount = 0;
const hand = [];
const grid = Array.from({ length: 20 }, () => Array(20).fill(null));
const tileTypes = ["🏠", "🪙", "🏭", "🌳", "❌"];
const tileAttributes = {
  "🏠": { cost: 20 },
  "🪙": { itemStock: 0, maxItemStock: 10, sellRate: 3, cost: 30 },
  "🏭": { itemYield: 1, itemStock: 0, cost: 40, upgradeLevel: 0 },
  "🌳": { resources: 200, cost: 40 },
  "❌": { cost: 0 } // Cost is 0 because it doesn't cost anything to use this tile
};

const gameBoard = document.getElementById("game-board");
const handElement = document.getElementById("hand");
const cashElement = document.getElementById("cash");
const newHandButton = document.getElementById("new-hand-button");
const upgradeButton = document.getElementById("upgrade-button");
const upgradeCountElement = document.getElementById("upgrade-count");
const manufacturingUpgradeButton = document.getElementById("manufacturing-upgrade-button");
const manufacturingUpgradeCountElement = document.getElementById("manufacturing-upgrade-count");

function initializeGame() {
  for (let i = 0; i < 5; i++) {
    addTileToHand();
  }
  renderHand();
  renderCash();
  createGrid();
  setInterval(gameTick, 1000);
  newHandButton.addEventListener("click", drawNewHand);
  upgradeButton.addEventListener("click", upgradeResources);
  manufacturingUpgradeButton.addEventListener("click", upgradeManufacturing);
}

function addTileToHand() {
  const randomTile = tileTypes[Math.floor(Math.random() * tileTypes.length)];
  hand.push({ type: randomTile, ...tileAttributes[randomTile] });
}

function renderHand() {
  handElement.innerHTML = "";
  hand.forEach((tile, index) => {
    const tileElement = document.createElement("div");
    tileElement.className = `hand-tile p-4 border-4 ${index === selectedTileIndex ? 'border-yellow-500' : 'border-transparent'} cursor-pointer`;
    tileElement.innerHTML = `${tile.type} <div class="text-sm text-gray-600">Cost: $${tile.cost}</div>`;
    tileElement.addEventListener("click", () => selectTile(index));
    handElement.appendChild(tileElement);
  });
}

function selectTile(index) {
  selectedTileIndex = index;
  renderHand();
}

function renderCash() {
  cashElement.innerText = `$${cash}`;
}

function createGrid() {
  gameBoard.innerHTML = "";
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 20; col++) {
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.addEventListener("click", () => placeTile(row, col));
      gameBoard.appendChild(cell);
    }
  }
}

function placeTile(x, y) {
  const selectedTile = hand[selectedTileIndex];
  if (selectedTile.type === "❌") {
    if (grid[x][y]) {
      grid[x][y] = null;
      const cell = gameBoard.children[x * 20 + y];
      cell.innerHTML = "";
      cash += 25;
      renderCash();
    }
    hand.splice(selectedTileIndex, 1);
    addTileToHand();
    renderHand();
    return;
  }
  if (cash < selectedTile.cost) return alert("Not enough cash!");
  if (grid[x][y]) return; // If cell is already occupied, do nothing
  const newTile = { ...selectedTile, x, y };
  if (newTile.type === "🌳") {
    newTile.resources = 200 + upgradeCount * 100; // Calculate resources based on upgradeCount
  }
  grid[x][y] = newTile;
  const tileElement = createTileElement(newTile);
  const targetCell = gameBoard.children[x * 20 + y];
  targetCell.appendChild(tileElement);
  cash -= selectedTile.cost;
  hand.splice(selectedTileIndex, 1);
  addTileToHand();
  renderHand();
  renderCash();
}

function createTileElement(tile) {
  const tileElement = document.createElement("div");
  tileElement.className = "grid-cell";
  if (tile.type === "🌳") {
    tileElement.style.backgroundColor = "lightgreen";
  } else if (tile.type === "🏭") {
    tileElement.style.backgroundColor = "lightcoral";
  } else if (tile.type === "🪙") {
    tileElement.style.backgroundColor = "lightblue";
  }
  tileElement.innerHTML = tile.type + 
    (tile.itemStock !== undefined ? `<div class="item-stock text-sm">S:${tile.itemStock}</div>` : "") + 
    (tile.resources !== undefined ? `<div class="item-stock text-sm">R:${tile.resources}</div>` : "") + 
    (tile.type === "🏠" ? `<div class="res-bonus text-sm" style="position: absolute; bottom: 2px; right: 2px;">B:${calculateResidentialBonus(tile)}</div>` : "");
  return tileElement;
}

function updateTileElement(tile) {
  const tileElement = gameBoard.children[tile.x * 20 + tile.y].firstChild;
  if (tileElement) {
    if (tile.type === "🌳") {
      tileElement.style.backgroundColor = "lightgreen";
    } else if (tile.type === "🏭") {
      tileElement.style.backgroundColor = "lightcoral";
    } else if (tile.type === "🪙") {
      tileElement.style.backgroundColor = "lightblue";
    } else {
      tileElement.style.backgroundColor = "";
    }
    tileElement.innerHTML = tile.type + 
      (tile.itemStock !== undefined ? `<div class="item-stock text-sm">S:${tile.itemStock}</div>` : "") + 
      (tile.resources !== undefined ? `<div class="item-stock text-sm">R:${tile.resources}</div>` : "") + 
      (tile.type === "🏠" ? `<div class="res-bonus text-sm" style="position: absolute; bottom: 2px; right: 2px;">B:${calculateResidentialBonus(tile)}</div>` : "");
  }
}

function gameTick() {
  grid.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (tile) {
        if (tile.type === "🏭") {
          generateManufacturingItems(tile);
        } else if (tile.type === "🪙") {
          moveItemsToCommercial(tile);
          generateRevenue(tile);
        }
        if (tile.resources !== undefined && tile.resources <= 0) {
          grid[rowIndex][colIndex] = null;
          const cell = gameBoard.children[rowIndex * 20 + colIndex];
          cell.innerHTML = "";
        } else {
          updateTileElement(tile);
        }
      }
    });
  });
}

function generateManufacturingItems(tile) {
  if (Date.now() % 5000 < 1000) { // Ensures it runs approximately every 5 seconds
    const nearbyResources = getNearbyTiles(tile, "🌳");
    if (nearbyResources.length > 0) {
      nearbyResources.forEach(resourceTile => {
        if (resourceTile.resources > 0) {
          tile.itemStock = Math.min(tile.itemStock + tile.itemYield, 10);
          resourceTile.resources = Math.max(resourceTile.resources - (1 + tile.upgradeLevel), 0);
        }
      });
    }
  }
}

function moveItemsToCommercial(tile) {
  if (Date.now() % 3000 < 1000) { // Ensures it runs approximately every 3 seconds
    const nearbyManufacturing = getNearbyTiles(tile, "🏭");
    if (nearbyManufacturing.length > 0) {
      nearbyManufacturing.forEach(manufacturingTile => {
        if (manufacturingTile.itemStock > 0) {
          tile.itemStock = Math.min(tile.itemStock + 1, tile.maxItemStock);
          manufacturingTile.itemStock--;
        }
      });
    }
  }
}

function generateRevenue(tile) {
  const bonus = calculateResidentialBonus(tile);
  if (tile.itemStock > 0 && Date.now() % (tile.sellRate * 1000) < 1000) { // Ensures it runs according to sell_rate
    const nearbyResidential = getNearbyTiles(tile, "🏠");
    if (nearbyResidential.length > 0) {
      cash += nearbyResidential.length + bonus;
      tile.itemStock--;
      renderCash();
      displayFadeText(tile, nearbyResidential.length + bonus);
    }
  }
}

function calculateResidentialBonus(tile) {
  const connectedResidentialTiles = findConnectedResidentialTiles(tile);
  const numberOfTiles = connectedResidentialTiles.length;
  return Math.floor(numberOfTiles / 3);
}

function findConnectedResidentialTiles(tile) {
  const visited = new Set();
  const queue = [tile];
  const connectedTiles = [];

  while (queue.length > 0) {
    const currentTile = queue.shift();
    const key = `${currentTile.x},${currentTile.y}`;
    if (!visited.has(key)) {
      visited.add(key);
      connectedTiles.push(currentTile);
      const neighbors = getNearbyTiles(currentTile, "🏠");
      neighbors.forEach(neighbor => {
        if (!visited.has(`${neighbor.x},${neighbor.y}`)) {
          queue.push(neighbor);
        }
      });
    }
  }

  return connectedTiles;
}

function getNearbyTiles(tile, type) {
  const nearbyPositions = [
    [tile.x - 1, tile.y],
    [tile.x + 1, tile.y],
    [tile.x, tile.y - 1],
    [tile.x, tile.y + 1],
    [tile.x - 1, tile.y - 1],
    [tile.x - 1, tile.y + 1],
    [tile.x + 1, tile.y - 1],
    [tile.x + 1, tile.y + 1],
  ];
  return nearbyPositions
    .map(([x, y]) => (grid[x] ? grid[x][y] : null))
    .filter(t => t && t.type === type);
}

function displayFadeText(tile, amount) {
  const fadeText = document.createElement("div");
  fadeText.className = "fade-text";
  fadeText.innerText = `+$${amount}`;
  const targetCell = gameBoard.children[tile.x * 20 + tile.y];
  targetCell.appendChild(fadeText);
  setTimeout(() => {
    fadeText.remove();
  }, 2000);
}

function drawNewHand() {
  if (cash >= 50) {
    cash -= 50;
    hand.length = 0; // Clear current hand
    for (let i = 0; i < 5; i++) {
      addTileToHand();
    }
    renderHand();
    renderCash();
  } else {
    alert("Not enough cash to draw a new hand!");
  }
}

function upgradeResources() {
  if (cash >= 100) {
    cash -= 100;
    upgradeCount++;
    renderCash();
    upgradeCountElement.innerText = upgradeCount;
  } else {
    alert("Not enough cash to upgrade!");
  }
}

function upgradeManufacturing() {
  if (cash >= 150) {
    cash -= 150;
    manufacturingUpgradeCount++;
    renderCash();
    manufacturingUpgradeCountElement.innerText = manufacturingUpgradeCount;
    grid.forEach(row => {
      row.forEach(tile => {
        if (tile && tile.type === "🏭") {
          tile.upgradeLevel = manufacturingUpgradeCount;
        }
      });
    });
  } else {
    alert("Not enough cash to upgrade!");
  }
}

initializeGame();