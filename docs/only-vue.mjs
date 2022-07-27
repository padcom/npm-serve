import { createApp, h } from 'vue'

const App = {
  data() {
    return {
      message: 'Hello, world! from Vue 3.x',
    }
  },
  render() {
    return h('h1', this.message)
  }
};

createApp(App).mount('#app')
