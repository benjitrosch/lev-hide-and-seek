import { launchClient } from './Client'

window.onload = function () {
    const form = document.getElementById('user') as HTMLFormElement
    form.style.display = 'flex'
    form.style.alignItems = 'center'
    form.style.justifyContent = 'center'
    
    const input = document.getElementById('username') as HTMLInputElement
    
    const hueSlider = document.getElementById('hue') as HTMLInputElement
    hueSlider.value = Math.floor(Math.random() * 360).toString()
    const brightnessSlider = document.getElementById('brightness') as HTMLInputElement
    brightnessSlider.value = (Math.floor(Math.random() * 3) + 1).toString()
    const previewImage = document.getElementById('preview') as HTMLImageElement
    previewImage.style.filter = `hue-rotate(${hueSlider.value}deg) brightness(${brightnessSlider.value})`
    const setPreviewFilterStyle = () => previewImage.style.filter = `hue-rotate(${hueSlider.value}deg) brightness(${brightnessSlider.value})`
    hueSlider.oninput = brightnessSlider.oninput = setPreviewFilterStyle

    form.onsubmit = (e) => {
        if (input.value.length < 3 || input.value.length > 16) return

        e.preventDefault()
        form.remove()

        launchClient(input.value, Number(hueSlider.value), Number(brightnessSlider.value))
    }
}
