const words = {
    4: ["word", "four", "door", "roof", "tree"],
    5: ["apple", "baker", "crate", "draft", "eagle"],
    6: ["anchor", "button", "create", "detail", "engine"],
    7: ["account", "balance", "combine", "dancing", "elegant"],
    8: ["absolute", "birthday", "campfire", "daylight", "elephant"]
};

let chosenWord = '';
let attempts = 6;

function startGame() {
    const length = parseInt(document.getElementById('word-length').value);
    if (length < 4 || length > 8) {
        alert('Please choose a word length between 4 and 8');
        return;
    }
    chosenWord = words[length][Math.floor(Math.random() * words[length].length)];
    attempts = 6;

    document.getElementById('game').innerHTML = '';
    document.getElementById('message').innerText = '';

    for (let i = 0; i < attempts; i++) {
        const row = document.createElement('div');
        row.classList.add('word-row', 'flex', 'justify-center', 'mb-2');
        for (let j = 0; j < length; j++) {
            const box = document.createElement('div');
            box.classList.add('letter-box', 'w-10', 'h-10', 'border', 'border-gray-400', 'flex', 'items-center', 'justify-center', 'text-2xl', 'font-bold', 'mx-1', 'bg-white');
            row.appendChild(box);
        }
        document.getElementById('game').appendChild(row);
    }
    createInputForm(length);
}

function createInputForm(length) {
    const inputForm = document.createElement('div');
    inputForm.classList.add('flex', 'justify-center', 'mt-4');
    inputForm.innerHTML = `
        <input type="text" id="guess-input" maxlength="${length}" size="${length}" class="p-2 border border-gray-400 rounded mr-2">
        <button onclick="submitGuess(${length})" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-700">Submit</button>
    `;
    document.getElementById('game').appendChild(inputForm);
}

function submitGuess(length) {
    const guess = document.getElementById('guess-input').value.toLowerCase();
    if (guess.length !== length) {
        alert(`Please enter a ${length}-letter word.`);
        return;
    }

    const currentRow = document.querySelectorAll('.word-row')[6 - attempts];
    const boxes = currentRow.children;
    let correctCount = 0;

    for (let i = 0; i < length; i++) {
        if (guess[i] === chosenWord[i]) {
            boxes[i].innerText = guess[i];
            boxes[i].classList.add('bg-green-400', 'text-white');
            correctCount++;
        } else if (chosenWord.includes(guess[i])) {
            boxes[i].innerText = guess[i];
            boxes[i].classList.add('bg-yellow-500', 'text-black');
        } else {
            boxes[i].innerText = guess[i];
            boxes[i].classList.add('bg-gray-400', 'text-white');
        }
    }

    attempts--;

    if (correctCount === length) {
        document.getElementById('message').innerText = 'Congratulations! You guessed the word!';
    } else if (attempts === 0) {
        document.getElementById('message').innerText = `Game Over! The word was ${chosenWord}.`;
    }
}
