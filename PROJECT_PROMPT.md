# Aplicación web estática responsiva en HTML5, CSS3 y Vanilla JavaScript para realizar un test rápido de daltonismo basado en láminas pseudoisocromáticas SVG (estilo Ishihara), con máquina de estados segura, compuerta de validación por placa de control, motor de puntuación puro e interfaz accesible en modo claro estricto.

## Objective
Aplicación web estática responsiva en HTML5, CSS3 y Vanilla JavaScript para realizar un test rápido de daltonismo basado en láminas pseudoisocromáticas SVG (estilo Ishihara), con máquina de estados segura, compuerta de validación por placa de control, motor de puntuación puro e interfaz accesible en modo claro estricto.

## Rationale
Reconcilia la simplicidad y carga instantánea de una SPA estática sin frameworks ni backend (Pragmatist) con las salvaguardas cromáticas, diagnósticas y de accesibilidad necesarias para que el test sea fiable en móviles y escritorio (Structuralist). Renderizar láminas SVG vectoriales mediante etiquetas <img> con color-scheme: light only evita la degradación por compresión WebP y la inversión por modo oscuro; separar 'No veo ninguna figura' de 'Omitir pregunta' junto con una placa de control inicial impide falsos positivos por brillo o filtros nocturnos; y la precarga progresiva (N+1/N+2) más el bloqueo anti-doble toque mantienen la experiencia fluida por debajo de 2-3 minutos.

## Deployment Target
github-pages
