module.exports = {
  content: [
    '../UX-UI/code.html',
    './webview/templates/**/*.html',
    './webview/modules/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'sans-serif'],
        script: ['Pacifico', 'cursive'],
      },
      colors: {
        primary: { DEFAULT: '#ea580c', hover: '#c2410c', subtle: '#ffedd5' },
      },
      boxShadow: {
        phone: '0 25px 60px -15px rgba(0,0,0,0.3), 0 0 0 10px #1e293b, 0 0 0 12px #334155',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
