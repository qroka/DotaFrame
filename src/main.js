import './style.css'
import { toPng } from 'html-to-image';

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

const selectFormat = document.querySelector('#input-format');
const posterFormat = document.querySelector('#format');

selectFormat.addEventListener('change', function () {
    posterFormat.textContent = selectFormat.value;
});

const downloadButton = document.querySelector('#download-png');
const poster = document.querySelector('#poster');

downloadButton.addEventListener('click', function (){
    console.log('Начинаем экспорт');

    toPng(poster, {
        width: 1080,
        height: 1080,
        pixelRatio: 1,
        style: {
            scale: 1,
            transform: 'none'
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

