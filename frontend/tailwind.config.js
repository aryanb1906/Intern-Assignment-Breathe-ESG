/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                ink: '#0f172a',
                moss: '#245447',
                sand: '#f5efe5',
                gold: '#c58b2c',
                mist: '#e9eef3',
            },
            boxShadow: {
                soft: '0 20px 50px rgba(15, 23, 42, 0.08)',
            },
        },
    },
    plugins: [],
}
