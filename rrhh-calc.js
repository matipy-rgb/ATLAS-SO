(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.AtlasHRCalc = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const MINUTES_DAY = 1440;
    const STATUS = {
        worked: "Trabajó",
        raw_missing: "FALTA pendiente",
        unexcused: "Ausencia injustificada",
        medical: "Reposo",
        permission: "Permiso",
        vacation: "Vacaciones",
        maternity: "Maternidad",
        holiday: "Feriado",
        rest: "Sin jornada",
        incomplete: "Marcación incompleta"
    };
    const excused = new Set(["medical", "permission", "vacation", "maternity"]);

    function pad(value) {
        return String(Math.trunc(Number(value) || 0)).padStart(2, "0");
    }

    function dateISO(value) {
        if (!value) return "";
        if (value instanceof Date && !Number.isNaN(value.valueOf())) {
            return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
        }
        const text = String(value).trim();
        let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match && validDateParts(match[1], match[2], match[3])) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
        match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (match && validDateParts(match[3], match[2], match[1])) return `${match[3]}-${pad(match[2])}-${pad(match[1])}`;
        return "";
    }

    function validDateParts(yearValue, monthValue, dayValue) {
        const year = Number(yearValue);
        const month = Number(monthValue);
        const day = Number(dayValue);
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    }

    function timeMinutes(value) {
        if (value === null || value === undefined || value === "") return null;
        if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.getHours() * 60 + value.getMinutes();
        if (typeof value === "number" && value >= 0 && value < 1) return Math.round(value * MINUTES_DAY);
        const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour > 47 || minute > 59) return null;
        return hour * 60 + minute;
    }

    function formatMinutes(value) {
        const minutes = Math.max(0, Math.round(Number(value) || 0));
        return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    }

    function hours(value) {
        return Math.round((Number(value || 0) / 60) * 100) / 100;
    }

    function dayOfWeek(isoDate) {
        const match = dateISO(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return -1;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
    }

    function scheduleRule(schedule, isoDate) {
        if (!schedule) return null;
        const day = dayOfWeek(isoDate);
        const rules = Array.isArray(schedule.rules) ? schedule.rules : [];
        const rule = rules.find(item => Number(item.day) === day && item.active !== false);
        if (rules.length && !rule) return null;
        const start = rule?.start || schedule.start;
        const end = rule?.end || schedule.end;
        if (!start || !end) return null;
        const startMinute = timeMinutes(start);
        let endMinute = timeMinutes(end);
        if (startMinute === null || endMinute === null) return null;
        if (endMinute <= startMinute) endMinute += MINUTES_DAY;
        return {
            day,
            start: startMinute,
            end: endMinute,
            breakMinutes: Math.max(0, Number(rule?.breakMinutes ?? schedule.breakMinutes ?? 0)),
            tolerance: Math.max(0, Number(rule?.tolerance ?? schedule.tolerance ?? 0))
        };
    }

    function intervalOverlap(start, end, rangeStart, rangeEnd) {
        return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
    }

    function nightMinutes(start, end) {
        if (start === null || end === null || end <= start) return 0;
        let total = 0;
        const firstDay = Math.floor(start / MINUTES_DAY) - 1;
        const lastDay = Math.floor(end / MINUTES_DAY) + 1;
        for (let day = firstDay; day <= lastDay; day += 1) {
            const base = day * MINUTES_DAY;
            total += intervalOverlap(start, end, base, base + 360);
            total += intervalOverlap(start, end, base + 1200, base + MINUTES_DAY);
        }
        return total;
    }

    function normalizedActual(record) {
        const inMinute = timeMinutes(record?.in ?? record?.entry ?? record?.entrada);
        let outMinute = timeMinutes(record?.out ?? record?.exit ?? record?.salida);
        if (inMinute !== null && outMinute !== null && outMinute <= inMinute) outMinute += MINUTES_DAY;
        return { start: inMinute, end: outMinute };
    }

    function resolveStatus(record, schedule, options) {
        const explicit = String(record?.resolvedStatus || record?.status || "").toLowerCase();
        const raw = String(record?.rawStatus || record?.out || record?.salida || "").toUpperCase();
        const actual = normalizedActual(record);
        const complete = actual.start !== null && actual.end !== null;
        if (explicit && explicit !== "worked") return explicit === "missing" ? "raw_missing" : explicit;
        if (options?.holiday && !complete) return "holiday";
        if (raw === "FALTA") return "raw_missing";
        if (!schedule && actual.start === null && actual.end === null) return "rest";
        if (actual.start === null || actual.end === null) return actual.start === null && actual.end === null ? "raw_missing" : "incomplete";
        if (!schedule && complete) return options?.holiday ? "holiday" : "worked";
        return options?.holiday ? "holiday" : "worked";
    }

    function calculateDay({ record = {}, schedule = null, holiday = false } = {}) {
        const date = dateISO(record.date);
        const rule = scheduleRule(schedule, date);
        const actual = normalizedActual(record);
        const status = resolveStatus(record, rule, { holiday });
        const scheduledMinutes = rule ? Math.max(0, rule.end - rule.start - rule.breakMinutes) : 0;
        const complete = actual.start !== null && actual.end !== null;
        const actualMinutes = complete ? Math.max(0, actual.end - actual.start - Number(record.breakMinutes ?? rule?.breakMinutes ?? 0)) : 0;
        const isHoliday = holiday || status === "holiday" || dayOfWeek(date) === 0;
        const result = {
            date,
            status,
            statusLabel: STATUS[status] || status,
            scheduledMinutes,
            actualMinutes,
            ordinaryDayMinutes: 0,
            nightPremiumMinutes: 0,
            extraDayMinutes: 0,
            extraNightMinutes: 0,
            sundayHolidayMinutes: 0,
            sundayHolidayNightMinutes: 0,
            missingMinutes: 0,
            absentDays: 0,
            vacationDays: 0,
            maternityDays: 0,
            permissionDays: 0,
            medicalDays: 0,
            warnings: []
        };
        if (status === "vacation") result.vacationDays = rule ? 1 : 0;
        if (status === "maternity") result.maternityDays = rule ? 1 : 0;
        if (status === "permission") result.permissionDays = rule ? 1 : 0;
        if (status === "medical") result.medicalDays = rule ? 1 : 0;
        if (status === "raw_missing" || status === "unexcused") {
            result.absentDays = rule ? 1 : 0;
            result.missingMinutes = scheduledMinutes;
            if (status === "raw_missing") result.warnings.push("La FALTA todavía necesita una justificación o confirmación.");
            return result;
        }
        if (excused.has(status) || status === "rest" || (status === "holiday" && !complete)) return result;
        if (!complete) {
            result.missingMinutes = scheduledMinutes;
            result.warnings.push("Falta una entrada o una salida; el cálculo no se cierra.");
            return result;
        }
        const actualNight = nightMinutes(actual.start, actual.end);
        if (isHoliday) {
            result.sundayHolidayMinutes = actualMinutes;
            result.sundayHolidayNightMinutes = Math.min(actualMinutes, actualNight);
            return result;
        }
        if (!rule) {
            result.ordinaryDayMinutes = Math.max(0, actualMinutes - actualNight);
            result.nightPremiumMinutes = Math.min(actualMinutes, actualNight);
            result.warnings.push("No hay un horario vigente para comparar esta marcación.");
            return result;
        }
        const tolerance = rule.tolerance;
        const lateArrival = Math.max(0, actual.start - rule.start);
        const earlyDeparture = Math.max(0, rule.end - actual.end);
        const forgivenMinutes = Math.min(lateArrival, tolerance) + Math.min(earlyDeparture, tolerance);
        const extraStart = Math.max(actual.start, rule.end + rule.tolerance);
        const extraAfter = Math.max(0, actual.end - extraStart);
        const extraBefore = Math.max(0, Math.min(actual.end, rule.start - rule.tolerance) - actual.start);
        const extraMinutes = Math.min(actualMinutes, extraAfter + extraBefore);
        const creditedOrdinaryMinutes = Math.min(scheduledMinutes, Math.max(0, actualMinutes - extraMinutes + forgivenMinutes));
        const ordinaryMinutes = Math.min(actualMinutes - extraMinutes, creditedOrdinaryMinutes);
        let extraNight = 0;
        if (extraAfter) extraNight += nightMinutes(extraStart, actual.end);
        if (extraBefore) extraNight += nightMinutes(actual.start, Math.min(actual.end, rule.start - rule.tolerance));
        extraNight = Math.min(extraMinutes, extraNight);
        result.extraNightMinutes = extraNight;
        result.extraDayMinutes = Math.max(0, extraMinutes - extraNight);
        const ordinaryNight = Math.max(0, Math.min(ordinaryMinutes, actualNight - extraNight));
        result.nightPremiumMinutes = ordinaryNight;
        result.ordinaryDayMinutes = Math.max(0, ordinaryMinutes - ordinaryNight);
        result.missingMinutes = Math.max(0, scheduledMinutes - creditedOrdinaryMinutes);
        return result;
    }

    function emptyTotals() {
        return {
            scheduledMinutes: 0,
            actualMinutes: 0,
            ordinaryDayMinutes: 0,
            nightPremiumMinutes: 0,
            extraDayMinutes: 0,
            extraNightMinutes: 0,
            sundayHolidayMinutes: 0,
            sundayHolidayNightMinutes: 0,
            missingMinutes: 0,
            absentDays: 0,
            vacationDays: 0,
            maternityDays: 0,
            permissionDays: 0,
            medicalDays: 0
        };
    }

    function summarize(days) {
        const totals = emptyTotals();
        (days || []).forEach(day => {
            Object.keys(totals).forEach(key => { totals[key] += Number(day?.[key] || 0); });
        });
        return totals;
    }

    function payable({ salary = 0, totals = {}, workerType = "monthly", rates = {} } = {}) {
        const baseSalary = Number(salary || 0);
        const divisor = Number(rates.monthlyHours || 240);
        const hourly = workerType === "parttime"
            ? Number(rates.partTimeHour || baseSalary / divisor)
            : workerType === "daily"
                ? Number(rates.dailyHour || baseSalary / Number(rates.dailyHours || 8))
                : baseSalary / divisor;
        const ordinaryNightPremium = hours(totals.nightPremiumMinutes) * hourly * 0.30;
        const extraDay = hours(totals.extraDayMinutes) * hourly * 1.50;
        const extraNight = hours(totals.extraNightMinutes) * hourly * 2;
        const sundayHoliday = hours(Math.max(0, totals.sundayHolidayMinutes - totals.sundayHolidayNightMinutes)) * hourly * 2;
        const sundayHolidayNight = hours(totals.sundayHolidayNightMinutes) * hourly * 2.6;
        const absenceDiscount = workerType === "monthly" ? (baseSalary / 30) * Number(totals.absentDays || 0) : 0;
        return {
            hourly,
            ordinaryNightPremium,
            extraDay,
            extraNight,
            sundayHoliday,
            sundayHolidayNight,
            absenceDiscount,
            variableTotal: ordinaryNightPremium + extraDay + extraNight + sundayHoliday + sundayHolidayNight - absenceDiscount,
            estimatedGross: Math.max(0, baseSalary + ordinaryNightPremium + extraDay + extraNight + sundayHoliday + sundayHolidayNight - absenceDiscount)
        };
    }

    return {
        STATUS,
        dateISO,
        timeMinutes,
        formatMinutes,
        hours,
        dayOfWeek,
        scheduleRule,
        nightMinutes,
        calculateDay,
        summarize,
        payable
    };
});
