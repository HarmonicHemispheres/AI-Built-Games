const initialCash = 500;
let cash = initialCash;
let selectedTileIndex = 0;
const hand = [];
const grid = Array.from({ length: 20 }, () => Array(20).fill(null));
const tileTypes = ["🏠", "🪙", "🏭", "🌳"];
const tileAttributes = {
  "🏠": {},
  "🪙": { itemStock: 0, maxItemStock: 10, sellRate: 3 },
  "🏭": { itemYield: 1, itemStock: 0 },
  "🌳": { resourceCount: 200 }
};

const gameBoard = document.getElementById("game-board");
const handElement = document.getElementById("hand");
const cashElement = document.getElementById("cash");

function initializeGame() {
  for (let i = 0; i < 4; i++) {
    addTileToHand();
  }
  renderHand();
  renderCash();
  createGrid();
  setInterval(gameTick, 1000);
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
    tileElement.innerText = tile.type;
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
  if (cash < 15) return alert("Not enough cash!");
  if (grid[x][y]) return; // If cell is already occupied, do nothing
  const selectedTile = hand[selectedTileIndex];
  const newTile = { ...selectedTile, x, y };
  grid[x][y] = newTile;
  const tileElement = createTileElement(newTile);
  const targetCell = gameBoard.children[x * 20 + y];
  targetCell.appendChild(tileElement);
  cash -= 15;
  hand.splice(selectedTileIndex, 1);
  addTileToHand();
  renderHand();
  renderCash();
}

function createTileElement(tile) {
  const tileElement = document.createElement("div");
  tileElement.className = "grid-cell";
  tileElement.innerHTML = tile.type + (tile.itemStock !== undefined ? `<div class="item-stock">Stock: ${tile.itemStock}</div>` : "");
  return tileElement;
}

function updateTileElement(tile) {
  const tileElement = gameBoard.children[tile.x * 20 + tile.y].firstChild;
  if (tileElement) {
    tileElement.innerHTML = tile.type + (tile.itemStock !== undefined ? `<div class="item-stock">Stock: ${tile.itemStock}</div>` : "");
  }
}

function gameTick() {
  grid.forEach(row => {
    row.forEach(tile => {
      if (tile) {
        if (tile.type === "🏭") {
          generateManufacturingItems(tile);
        } else if (tile.type === "🪙") {
          moveItemsToCommercial(tile);
          generateRevenue(tile);
        }
        if (tile.itemStock !== undefined) {
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
        if (resourceTile.resourceCount > 0) {
          tile.itemStock = Math.min(tile.itemStock + tile.itemYield, 10);
          resourceTile.resourceCount--;
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
  if (tile.itemStock > 0 && Date.now() % (tile.sellRate * 1000) < 1000) { // Ensures it runs according to sell_rate
    const nearbyResidential = getNearbyTiles(tile, "🏠");
    if (nearbyResidential.length > 0) {
      cash += nearbyResidential.length;
      tile.itemStock--;
      renderCash();
      displayFadeText(tile, nearbyResidential.length);
    }
  }
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

initializeGame();
