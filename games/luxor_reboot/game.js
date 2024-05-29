const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');

const colors = ['red', 'green', 'blue'];
let player = { x: 575, y: 750, width: 50, height: 50, color: colors[Math.floor(Math.random() * colors.length)] };
let circles = [];
let projectiles = [];
let keys = {};
let path = [];
let gameInterval;
let score = 0;
let canShoot = true;
const circleRadius = 15;
const circleSpacing = circleRadius * 2.4; // 1.2 circles' width apart

document.addEventListener('keydown', function(event) {
    keys[event.code] = true;
});

document.addEventListener('keyup', function(event) {
    keys[event.code] = false;
});

document.addEventListener('keypress', function(event) {
    if (event.code === 'Space' && canShoot) {
        shootProjectile();
    }
});

function startGame() {
    generatePath();
    gameInterval = setInterval(updateGame, 20);
    spawnCircleGroup();
    setInterval(spawnCircleGroup, 3000); // Spawn a new group every 3 seconds
}

function generatePath() {
    path = [];
    let x = Math.random() * (canvas.width - 100) + 50;
    let y = 50;
    let directions = ['left', 'right', 'down'];
    path.push({ x: x, y: y });

    while (y < player.y - 100) {
        let direction = directions[Math.floor(Math.random() * directions.length)];
        let length = Math.floor(Math.random() * 200 + 100);

        if (direction === 'left') {
            x -= length;
            if (x < 50) x = 50;
        } else if (direction === 'right') {
            x += length;
            if (x > canvas.width - 50) x = canvas.width - 50;
        } else if (direction === 'down') {
            y += length;
            if (y > player.y - 100) y = player.y - 100;
        }

        let newSegment = { x: x, y: y };

        if (!isOverlapping(newSegment)) {
            path.push(newSegment);
        }
    }

    path.push({ x: Math.random() * (canvas.width - 100) + 50, y: player.y - 100 });
}

function isOverlapping(newSegment) {
    for (let i = 0; i < path.length - 1; i++) {
        let segment = path[i];
        if (Math.abs(segment.x - newSegment.x) < circleSpacing && Math.abs(segment.y - newSegment.y) < circleSpacing) {
            return true;
        }
    }
    return false;
}

function updateGame() {
    clearCanvas();
    drawPath();
    movePlayer();
    moveProjectiles();
    moveCircles();
    checkCollisions();
    drawPlayer();
    drawProjectiles();
    drawCircles();
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawPath() {
    ctx.strokeStyle = 'lightgrey';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
        if (i === 0) {
            ctx.moveTo(path[i].x, path[i].y);
        } else {
            ctx.lineTo(path[i].x, path[i].y);
        }
    }
    ctx.stroke();
    ctx.closePath();
}

function movePlayer() {
    if (keys['ArrowLeft'] && player.x > 0) {
        player.x -= 5;
    }
    if (keys['ArrowRight'] && player.x < canvas.width - player.width) {
        player.x += 5;
    }
}

function moveProjectiles() {
    projectiles.forEach((projectile, index) => {
        projectile.y -= 5;
        if (projectile.y < 0) {
            projectiles.splice(index, 1);
        }
    });
}

function moveCircles() {
    circles.forEach(circle => {
        let point = path[circle.pathIndex];
        if (point) {
            let dx = point.x - circle.x;
            let dy = point.y - circle.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 1) {
                circle.pathIndex++;
                if (circle.pathIndex >= path.length) {
                    gameOver();
                }
            } else {
                let angle = Math.atan2(dy, dx);
                circle.x += Math.cos(angle);
                circle.y += Math.sin(angle);
            }
        }
    });
}

function checkCollisions() {
    projectiles.forEach((projectile, pIndex) => {
        circles.forEach((circle, cIndex) => {
            if (isColliding(projectile, circle)) {
                if (projectile.color === circle.color) {
                    let sameColorGroup = getSameColorGroup(circle);
                    sameColorGroup.forEach(scc => {
                        circles.splice(circles.indexOf(scc), 1);
                    });
                    updateScore(sameColorGroup.length);
                } else {
                    circles.push({
                        x: circle.x,
                        y: circle.y,
                        radius: circleRadius,
                        color: projectile.color,
                        pathIndex: circle.pathIndex
                    });
                }
                projectiles.splice(pIndex, 1);
            }
        });
    });
}

function getSameColorGroup(circle) {
    let group = [circle];
    let index = circles.indexOf(circle);

    // Check backward
    for (let i = index - 1; i >= 0; i--) {
        if (circles[i].color === circle.color) {
            group.unshift(circles[i]);
        } else {
            break;
        }
    }

    // Check forward
    for (let i = index + 1; i < circles.length; i++) {
        if (circles[i].color === circle.color) {
            group.push(circles[i]);
        } else {
            break;
        }
    }

    return group;
}

function drawPlayer() {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawProjectiles() {
    projectiles.forEach(projectile => {
        ctx.fillStyle = projectile.color;
        ctx.fillRect(projectile.x, projectile.y, projectile.width, projectile.height);
    });
}

function drawCircles() {
    circles.forEach(circle => {
        ctx.fillStyle = circle.color;
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    });
}

function shootProjectile() {
    projectiles.push({
        x: player.x + player.width / 2 - 5,
        y: player.y - 10,
        width: 10,
        height: 20,
        color: player.color
    });
    player.color = colors[Math.floor(Math.random() * colors.length)];
    canShoot = false;
    setTimeout(() => {
        canShoot = true;
    }, 500); // Cooldown of 500ms
}

function spawnCircleGroup() {
    let groupSize = Math.floor(Math.random() * 8) + 5; // Random size between 5 and 12
    let groupColor = colors[Math.floor(Math.random() * colors.length)]; // Single color for the group

    for (let i = 0; i < groupSize; i++) {
        let delay = i * circleSpacing; // Delay each circle in the group slightly to space them out
        setTimeout(() => {
            circles.push({
                x: path[0].x,
                y: path[0].y,
                radius: circleRadius,
                color: groupColor,
                pathIndex: 1
            });
        }, delay);
    }
}

function isColliding(a, b) {
    return a.x < b.x + b.radius &&
        a.x + a.width > b.x - b.radius &&
        a.y < b.y + b.radius &&
        a.y + a.height > b.y - b.radius;
}

function gameOver() {
    clearInterval(gameInterval);
    alert('Game Over!');
}

function updateScore(points) {
    score += points;
    scoreDisplay.textContent = `Score: ${score}`;
}

startGame();
