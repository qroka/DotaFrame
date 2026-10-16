import './style.css'
import { toPng } from 'html-to-image';


// Ввод информации тип input

function bindInput(inputSelector, posterSelector) {
    const input = document.querySelector(inputSelector);
    const poster = document.querySelector(posterSelector);

    const defaultText = poster.textContent;

    input.addEventListener('input', function () {

        const value = input.value.trim();

        poster.textContent = value || defaultText;
    });

}

bindInput('#input-team-a', '#team-a');
bindInput('#input-team-b', '#team-b');
bindInput('#input-tournament', '#tournament');
bindInput('#input-time', '#time');

// Ввод формат тип change

const selectFormat = document.querySelector('#input-format');
const posterFormat = document.querySelector('#format');

selectFormat.addEventListener('change', function () {
    posterFormat.textContent = selectFormat.value;
});


// Экспорт в PNG

const downloadButton = document.querySelector('#download-png');
const poster = document.querySelector('#poster');

downloadButton.addEventListener('click', function () {
    console.log('Начинаем экспорт');

    toPng(poster, {
        width: 1080,
        height: 1080,
        pixelRatio: 1,
        style: {
            scale: 1,
            transform: 'none'
        },
        filter: function (node) {
            if (node.tagName === 'IMG' && !node.getAttribute('src')) {
                return false;
            }

            return true;
        }
    }).then(function (dataUrl) {
        const downloadLink = document.createElement('a');
        downloadLink.href = dataUrl;
        downloadLink.download = 'dotaframe.png';
        downloadLink.click();
        console.log('Изображение создано!');
    }).catch(function (error) {
        console.error('Ошибка экспорта:', error);
    });
});

// Загрузка логотипа команд

function bindLogo(inputSelector, posterSelector, removeSelector, placeholderSelector) {
    const logoInput = document.querySelector(inputSelector);
    const logoImage = document.querySelector(posterSelector);
    const removeButton = document.querySelector(removeSelector);
    const placeholder = document.querySelector(placeholderSelector);

    let currentUrl = null;

    logoInput.addEventListener('change', function () {
        const file = logoInput.files[0];

        if (!file) return;

        const imageUrl = URL.createObjectURL(file);

        logoImage.src = imageUrl;
        logoImage.classList.remove('hidden');
        removeButton.classList.remove('hidden');
        placeholder.classList.add('hidden');

        if (currentUrl !== null) {
            URL.revokeObjectURL(currentUrl);
        }

        currentUrl = imageUrl

    });
    // Удаление логотипа команд
    removeButton.addEventListener('click', function () {

        logoImage.removeAttribute('src');
        logoImage.classList.add('hidden');
        removeButton.classList.add('hidden');
        placeholder.classList.remove('hidden');        
        logoInput.value = '';

        if (currentUrl !== null) {
            URL.revokeObjectURL(currentUrl);
            currentUrl = null;
        }        
    });
}

bindLogo('#input-logo-team-a', '#logo-team-a', '#remove-logo-a', '#placeholder-logo-a');
bindLogo('#input-logo-team-b', '#logo-team-b', '#remove-logo-b', '#placeholder-logo-b');



