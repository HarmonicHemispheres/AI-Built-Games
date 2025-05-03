const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');
const info = document.getElementById('info');
const gameOverDiv = document.getElementById('gameOver');

const playerSize = 30;
const portalSize = 30;
const zombieSize = 30;
const screenWidth = canvas.width;
const screenHeight = canvas.height;
const roomMargin = 50;
const corridorWidth = 50;
const playerSpeed = 0.2;
const zombieSpeed = 0.1;
let mazeCount = 0;
let roomCount = 5;
let mapWidth = 1000;
let mapHeight = 1000;
let player;
let portal;
let zombies = [];
let rooms = [];
let corridors = [];
let gameOver = false;
let keys = {};

document.addEventListener('keydown', (event) => keys[event.key] = true);
document.addEventListener('keyup', (event) => keys[event.key] = false);

function startGame() {
    mazeCount = 0;
    roomCount = 5;
    generateMaze();
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (!gameOver) {
        updatePlayer();
        updateZombies();
        checkPortalCollision();
        render();
        requestAnimationFrame(gameLoop);
    }
}

function updatePlayer() {
    let velocityX = 0;
    let velocityY = 0;

    if (keys['ArrowLeft'] || keys['a']) {
        velocityX = -playerSpeed;
    }
    if (keys['ArrowRight'] || keys['d']) {
        velocityX = playerSpeed;
    }
    if (keys['ArrowUp'] || keys['w']) {
        velocityY = -playerSpeed;
    }
    if (keys['ArrowDown'] || keys['s']) {
        velocityY = playerSpeed;
    }

    const newX = player.x + velocityX;
    const newY = player.y + velocityY;

    if (!isColliding(newX, newY, playerSize, playerSize)) {
        player.x = newX;
        player.y = newY;
    }
}

function generateMaze() {
    rooms = [];
    corridors = [];
    zombies = [];
    context.clearRect(0, 0, mapWidth, mapHeight);

    mapWidth = roomCount * 200;
    mapHeight = roomCount * 200;

    // Generate non-overlapping rooms
    for (let i = 0; i < roomCount; i++) {
        let room;
        let overlapping;
        do {
            overlapping = false;
            room = {
                x: getRandomInt(roomMargin, mapWidth - 300),
                y: getRandomInt(roomMargin, mapHeight - 300),
                width: getRandomInt(200, 300),
                height: getRandomInt(200, 300)
            };

            // Check if room overlaps with existing rooms
            for (const existingRoom of rooms) {
                if (isOverlapping(room, existingRoom)) {
                    overlapping = true;
                    break;
                }
            }
        } while (overlapping);

        rooms.push(room);
    }

    // Generate corridors connecting rooms
    for (let i = 0; i < rooms.length - 1; i++) {
        const roomA = rooms[i];
        const roomB = rooms[i + 1];

        const centerA = { x: roomA.x + roomA.width / 2, y: roomA.y + roomA.height / 2 };
        const centerB = { x: roomB.x + roomB.width / 2, y: roomB.y + roomB.height / 2 };

        if (Math.random() > 0.5) {
            createCorridor(centerA.x, centerB.x, centerA.y, true);
            createCorridor(centerA.y, centerB.y, centerB.x, false);
        } else {
            createCorridor(centerA.y, centerB.y, centerA.x, false);
            createCorridor(centerA.x, centerB.x, centerB.y, true);
        }
    }

    player = { x: rooms[0].x + 10, y: rooms[0].y + 10, size: playerSize };
    portal = { x: rooms[rooms.length - 1].x + 10, y: rooms[rooms.length - 1].y + 10, size: portalSize };

    // Generate zombies
    for (let i = 0; i < 1 + mazeCount; i++) {
        const room = rooms[getRandomInt(1, rooms.length)]; // Ensure zombies don't spawn in the first room
        const zombie = { x: room.x + 10, y: room.y + 10, size: zombieSize };
        zombies.push(zombie);
    }

    updateInfo();
    render();
}

function createCorridor(start, end, fixed, isHorizontal) {
    const corridor = {
        x: isHorizontal ? Math.min(start, end) : fixed - corridorWidth / 2,
        y: isHorizontal ? fixed - corridorWidth / 2 : Math.min(start, end),
        width: isHorizontal ? Math.abs(end - start) : corridorWidth,
        height: isHorizontal ? corridorWidth : Math.abs(end - start)
    };
    corridors.push(corridor);
}

function render() {
    context.clearRect(0, 0, screenWidth, screenHeight);

    const offsetX = Math.min(Math.max(player.x - screenWidth / 2, 0), mapWidth - screenWidth);
    const offsetY = Math.min(Math.max(player.y - screenHeight / 2, 0), mapHeight - screenHeight);

    context.save();
    context.translate(-offsetX, -offsetY);

    context.fillStyle = '#6666ff';
    rooms.forEach(room => {
        context.fillRect(room.x, room.y, room.width, room.height);
    });

    corridors.forEach(corridor => {
        context.fillRect(corridor.x, corridor.y, corridor.width, corridor.height);
    });

    context.fillStyle = 'red';
    context.fillRect(player.x, player.y, player.size, player.size);

    context.fillStyle = 'green';
    context.fillRect(portal.x, portal.y, portal.size, portal.size);

    context.fillStyle = 'purple';
    zombies.forEach(zombie => {
        context.fillRect(zombie.x, zombie.y, zombie.size, zombie.size);
    });

    context.restore();
}

function isColliding(x, y, width, height) {
    const collidesWithRoom = rooms.some(room => 
        x < room.x + room.width &&
        x + width > room.x &&
        y < room.y + room.height &&
        y + height > room.y
    );

    const collidesWithCorridor = corridors.some(corridor =>
        x < corridor.x + corridor.width &&
        x + width > corridor.x &&
        y < corridor.y + corridor.height &&
        y + height > corridor.y
    );

    return !(collidesWithRoom || collidesWithCorridor);
}

function checkPortalCollision() {
    if (
        player.x < portal.x + portal.size &&
        player.x + player.size > portal.x &&
        player.y < portal.y + portal.size &&
        player.y + player.size > portal.y
    ) {
        roomCount += 3;
        mazeCount++;
        generateMaze();
    }
}

function updateZombies() {
    zombies.forEach(zombie => {
        let velocityX = 0;
        let velocityY = 0;

        if (player.x < zombie.x) {
            velocityX = -zombieSpeed;
        } else if (player.x > zombie.x) {
            velocityX = zombieSpeed;
        }

        if (player.y < zombie.y) {
            velocityY = -zombieSpeed;
        } else if (player.y > zombie.y) {
            velocityY = zombieSpeed;
        }

        const newX = zombie.x + velocityX;
        const newY = zombie.y + velocityY;

        if (!isColliding(newX, newY, zombieSize, zombieSize)) {
            zombie.x = newX;
            zombie.y = newY;
        }

        if (isOverlapping(zombie, player)) {
            gameOver = true;
            gameOverDiv.style.display = 'block';
        }
    });
}

function updateInfo() {
    info.textContent = `Mazes completed: ${mazeCount} | Rooms in current maze: ${roomCount}`;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function isOverlapping(rectA, rectB) {
    return rectA.x < rectB.x + rectB.size &&
           rectA.x + rectA.size > rectB.x &&
           rectA.y < rectB.y + rectB.size &&
           rectA.y + rectA.size > rectB.y;
}

startGame();
