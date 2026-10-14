import './style.css';
import { toPng } from 'html-to-image';

// Шаг 1: находим элементы страницы.
const form = document.querySelector('#match-form');
const poster = document.querySelector('#poster');
const stage = document.querySelector('#preview-stage');
const scaleBox = document.querySelector('#preview-scale');
const downloadButton = document.querySelector('#export-button');
const status = document.querySelector('#export-status');

const fields = {
  teamA: document.querySelector('#team-a'),
  teamB: document.querySelector('#team-b'),
  tournament: document.querySelector('#tournament'),
  date: document.querySelector('#match-date'),
  time: document.querySelector('#match-time'),
  format: document.querySelector('#format'),
};

const output = {
  teamA: document.querySelector('#poster-team-a'),
  teamB: document.querySelector('#poster-team-b'),
  tournament: document.querySelector('#poster-tournament'),
  date: document.querySelector('#poster-date'),
  time: document.querySelector('#poster-time'),
};

const POSTER_SIZE = 1080;

function formatDate(date) {
  if (!date) return 'ДАТА НЕ УКАЗАНА';
  const [year, month, day] = date.split('-');
  return day + '.' + month + '.' + year;
}

// Шаг 2: собираем значения полей в JS-объект.
function readMatch() {
  return {
    teamA: fields.teamA.value.trim() || 'TEAM A',
    teamB: fields.teamB.value.trim() || 'TEAM B',
    tournament: fields.tournament.value.trim() || 'TOURNAMENT',
    date: fields.date.value,
    time: fields.time.value || '--:--',
    format: fields.format.value,
  };
}

// Шаг 3: переносим данные на карточку. textContent безопасен для пользовательского текста.
function updatePoster() {
  const match = readMatch();
  output.teamA.textContent = match.teamA;
  output.teamB.textContent = match.teamB;
  output.tournament.textContent = match.tournament;
  output.date.textContent = formatDate(match.date);
  output.time.textContent = match.format + ' · ' + match.time;
}

// Шаг 4: уменьшаем ТОЛЬКО предпросмотр, не размер исходного #poster.
function resizePreview() {
  const scale = stage.clientWidth / POSTER_SIZE;
  scaleBox.style.transform = 'scale(' + scale + ')';
}

form.addEventListener('input', updatePoster);
form.addEventListener('change', updatePoster);
new ResizeObserver(resizePreview).observe(stage);
updatePoster();
resizePreview();

// Шаг 5: html-to-image превращает HTML-узел в PNG.
downloadButton.addEventListener('click', async () => {
  downloadButton.disabled = true;
  downloadButton.textContent = 'Формирование PNG…';
  status.textContent = '';

  try {
    await document.fonts.ready;
    const dataUrl = await toPng(poster, {
      width: POSTER_SIZE,
      height: POSTER_SIZE,
      pixelRatio: 1,
      backgroundColor: '#1b263c',
    });

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'dotaframe-announcement.png';
    link.click();
    status.textContent = 'PNG сформирован. Проверь размер: 1080 × 1080.';
  } catch (error) {
    console.error('Ошибка экспорта PNG:', error);
    status.textContent = 'Не удалось экспортировать PNG. Открой консоль (F12).';
  } finally {
    downloadButton.disabled = false;
    downloadButton.textContent = 'Скачать PNG 1080 × 1080';
  }
});
