// Первым: забрать и стереть код авторизации из адреса (см. boot.ts).
import { authCallback } from './boot';
import { mount } from 'svelte';
import './design/base.css';
import './design/fonts/inter.css';
import App from './features/app/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app is missing from index.html');

export default mount(App, { target, props: { authCallback } });
