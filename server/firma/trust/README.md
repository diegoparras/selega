# Trust store — raíces de confianza para la verificación de firma

Soltá acá los certificados raíz (`.pem`/`.crt`/`.cer`) que la verificación de firma debe
considerar **confiables**, y reiniciá Selega. Una firma cuya cadena llegue a alguna de estas
raíces da 🟢; si es íntegra pero no llega a ninguna, da 🟡 observada.

Qué cargar en producción:

- **AC Raíz de la República Argentina** (IFDRA) y las ACs licenciadas / del Consejo.
- La AC del token con que firman los matriculados, si es propia del Consejo.

> `test-root-ca.pem` es la **raíz de prueba de Trustux** (self-signed, sin valor legal). Sirve
> para validar los PDFs de ejemplo. **Borrala en producción** y cargá las raíces reales.
