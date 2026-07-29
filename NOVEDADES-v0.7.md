# ATLAS SO v0.7 · actualización integral de RR. HH.

## Decisiones estructurales

- Empresa y cliente son entidades separadas con identificadores estables.
- Nombres y logos se pueden modificar sin mover ni perder información.
- Nómina general consolida; no crea un cliente ficticio.
- Ya no existe el módulo duplicado “Clientes y sucursales”.
- No se muestran ni aplican referencias de capacidad.

## Flujo operativo

1. Elegir empresa administrada.
2. Elegir Nómina general o cliente.
3. Cargar o importar funcionarios.
4. Crear horarios por denominación y vigencia.
5. Asignar horarios.
6. Importar el archivo del reloj.
7. Vincular los ID desconocidos.
8. Revisar FALTA, permisos, reposos, vacaciones y maternidad.
9. Calcular el periodo.
10. Exportar el resumen y detalle.

## Migración

La primera apertura conserva los registros anteriores y los reúne por empresa, agregando el identificador del cliente cuando puede determinarlo. No elimina las claves anteriores.

## Base de datos

Después de la actualización de archivos debe ejecutarse una sola vez:

```text
supabase/v0.7-rrhh-scale.sql
```

Esto habilita marcaciones por fila con índices mensuales y acceso restringido a la cuenta administradora de RR. HH.
