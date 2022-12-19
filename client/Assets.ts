/** base asset class to handle file loading */
export abstract class Asset {
    protected filePath: string
    public fileName: string
  
    constructor(filePath: string) {
        this.filePath = `./public/${filePath}`
  
        const directories = filePath.split('/')
        this.fileName = directories[directories.length - 1] ?? filePath
    }
}

/** image asset */
export class Sprite extends Asset {
    public image: HTMLImageElement
    public loaded: boolean = false
  
    constructor(filePath: string) {
        super(filePath)
    
        const image = new Image()
        image.src = this.filePath
        image.onload = () => {
            this.loaded = true
        }
    
        this.image = image
    }
}   

/** font asset loaded as fontface rather than from css */
export class Font extends Asset {
    private font: FontFace
    public name: string = ''
    public loaded: boolean = false
  
    constructor(name: string, path: string) {
        super(path)
        
        this.font = new FontFace(name, `url(${this.filePath})`)
        this.font.load().then((font) => {
            document.fonts.add(font)
            this.name = '12px ' + name
            this.loaded = true
        })
    }
}
