import { mount } from 'svelte';
import './design/base.css';
import App from './features/app/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app is missing from index.html');

export default mount(App, { target });
