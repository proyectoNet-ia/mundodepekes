const fecha_evento = '2026-05-19';
const hora_inicio = '21:30:00';

const [year, month, day] = fecha_evento.split('-');
const [hour, min] = hora_inicio.split(':');
const fechaInicio = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
const ahora = new Date('2026-05-19T22:47:40-06:00');
const treintaMinAntes = new Date(fechaInicio.getTime() - 30 * 60000);

console.log('fechaInicio:', fechaInicio.toString());
console.log('ahora:', ahora.toString());
console.log('treintaMinAntes:', treintaMinAntes.toString());
console.log('ahora < treintaMinAntes:', ahora < treintaMinAntes);
