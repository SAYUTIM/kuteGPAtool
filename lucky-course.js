(() => {
    'use strict';

    const section = document.getElementById('lucky-course');
    const reel = document.getElementById('luckyCourseReel');
    const value = document.getElementById('luckyCourseValue');
    const department = document.getElementById('luckyCourseDepartment');
    const button = document.getElementById('luckyCourseButton');
    const announcement = document.getElementById('luckyCourseAnnouncement');

    if (!section || !reel || !value || !department || !button || !announcement) return;

    const FACULTIES = [
        { name: '先進工学部', codes: ['s1', 's2', 's3', 's4', 's5', 'ss'] },
        { name: '工学部', codes: ['a1', 'a2', 'c4'] },
        { name: '建築学部', codes: ['da', 'db', 'dc'] },
        { name: '情報学部', codes: ['j0', 'j1', 'j2', 'j3'] }
    ];
    const ALL_DEPARTMENT_CODES = new Set(FACULTIES.flatMap((faculty) => faculty.codes));

    let courseOptionsPromise = null;
    let spinning = false;
    let lastCourseName = '';
    let resizeTimer = 0;

    function randomIndex(length) {
        if (length <= 1) return 0;
        if (globalThis.crypto?.getRandomValues) {
            const numbers = new Uint32Array(1);
            globalThis.crypto.getRandomValues(numbers);
            return numbers[0] % length;
        }
        return Math.floor(Math.random() * length);
    }

    function pickCourse(courseOptions, avoidName = '') {
        if (courseOptions.length === 1) return courseOptions[0];
        let selected = courseOptions[randomIndex(courseOptions.length)];
        for (let attempt = 0; attempt < 5 && selected.name === avoidName; attempt += 1) {
            selected = courseOptions[randomIndex(courseOptions.length)];
        }
        return selected;
    }

    function uniqueParts(valueToSplit) {
        return Array.from(new Set(String(valueToSplit || '')
            .split('|')
            .map((part) => part.trim())
            .filter(Boolean)));
    }

    function describeAudience(codes, departments) {
        const codeSet = new Set(codes);
        const fullDepartmentText = departments.join('・');
        const facultyNames = FACULTIES
            .filter((faculty) => faculty.codes.some((code) => codeSet.has(code)))
            .map((faculty) => faculty.name);

        if (ALL_DEPARTMENT_CODES.size > 0
            && Array.from(ALL_DEPARTMENT_CODES).every((code) => codeSet.has(code))) {
            return {
                short: '全学部・学科',
                full: fullDepartmentText || '全学部・学科'
            };
        }

        const facultyText = facultyNames.join('・');
        const departmentText = departments.length <= 2
            ? departments.join('・')
            : `${departments.slice(0, 2).join('・')} ほか${departments.length - 2}学科`;
        const short = [facultyText, departmentText].filter(Boolean).join(' ｜ ');

        return {
            short: short || '対象学科の記載なし',
            full: [facultyNames.join('・'), fullDepartmentText].filter(Boolean).join(' ｜ ')
                || '対象学科の記載なし'
        };
    }

    async function loadCourseOptions() {
        let syllabus = [];

        if (typeof loadSyllabusData === 'function') {
            syllabus = await loadSyllabusData();
        } else {
            const response = await fetch('./dataset/dataset_syllabus.json');
            if (!response.ok) throw new Error(`Syllabus request failed: ${response.status}`);
            syllabus = await response.json();
        }

        const coursesByName = new Map();
        syllabus.forEach((course) => {
            const primaryName = String(course?.courseName || '').split('|')[0].trim();
            if (!primaryName) return;

            const existing = coursesByName.get(primaryName) || {
                name: primaryName,
                codes: new Set(),
                departments: new Set()
            };
            uniqueParts(course?.department_num).forEach((code) => existing.codes.add(code));
            uniqueParts(course?.department).forEach((name) => existing.departments.add(name));
            coursesByName.set(primaryName, existing);
        });

        const courseOptions = Array.from(coursesByName.values()).map((course) => ({
            name: course.name,
            audience: describeAudience(Array.from(course.codes), Array.from(course.departments))
        }));
        if (!courseOptions.length) throw new Error('Syllabus contains no course names.');
        return courseOptions;
    }

    function getCourseOptions() {
        if (!courseOptionsPromise) {
            courseOptionsPromise = loadCourseOptions().catch((error) => {
                courseOptionsPromise = null;
                throw error;
            });
        }
        return courseOptionsPromise;
    }

    function showCourse(course, animate = false) {
        value.textContent = course.name;
        value.title = course.name;
        value.dataset.courseName = course.name;
        department.textContent = course.audience.short;
        department.title = course.audience.full;

        if (!animate) return;
        if (typeof value.animate === 'function') {
            value.animate([
                { opacity: 0.25, transform: 'translateY(-10px)' },
                { opacity: 1, transform: 'translateY(0)' }
            ], {
                duration: 120,
                easing: 'cubic-bezier(.22, 1, .36, 1)'
            });
        }
    }

    function fitCourseName() {
        value.style.removeProperty('font-size');
        if (!section.classList.contains('has-result')) return;

        const availableWidth = value.clientWidth;
        const naturalWidth = value.scrollWidth;
        if (!availableWidth || naturalWidth <= availableWidth) return;

        const baseSize = Number.parseFloat(getComputedStyle(value).fontSize);
        const fittedSize = Math.max(14, Math.floor(baseSize * (availableWidth / naturalWidth)));
        value.style.fontSize = `${fittedSize}px`;
    }

    function runRoulette(courseOptions) {
        return new Promise((resolve) => {
            const duration = 3000;
            const startedAt = performance.now();
            let nextChangeAt = startedAt;

            function frame(now) {
                const elapsed = now - startedAt;
                const progress = Math.min(elapsed / duration, 1);

                if (now >= nextChangeAt && progress < 1) {
                    showCourse(pickCourse(courseOptions, value.dataset.courseName), true);
                    const delay = 54 + (progress ** 3) * 250;
                    nextChangeAt = now + delay;
                }

                if (progress < 1) {
                    requestAnimationFrame(frame);
                    return;
                }

                resolve(pickCourse(courseOptions, lastCourseName));
            }

            requestAnimationFrame(frame);
        });
    }

    async function tellFortune() {
        if (spinning) return;
        spinning = true;

        section.classList.remove('has-result');
        section.classList.add('is-loading');
        section.setAttribute('aria-busy', 'true');
        button.disabled = true;
        button.querySelector('span').textContent = '準備中';
        value.style.removeProperty('font-size');
        value.removeAttribute('title');
        delete value.dataset.courseName;
        value.textContent = 'シラバスを読み込んでいます';
        department.textContent = '';
        department.removeAttribute('title');
        announcement.textContent = '';

        try {
            const courseOptions = await getCourseOptions();
            section.classList.remove('is-loading');
            section.classList.add('is-spinning');
            button.querySelector('span').textContent = '占い中';

            const selectedCourse = await runRoulette(courseOptions);
            lastCourseName = selectedCourse.name;
            showCourse(selectedCourse);
            section.classList.remove('is-spinning');
            section.classList.add('has-result');
            requestAnimationFrame(fitCourseName);
            announcement.textContent = `おすすめの授業は、${selectedCourse.name}です。対象は、${selectedCourse.audience.full}です。`;
            button.querySelector('span').textContent = 'もう一度';
        } catch (error) {
            console.error('[lucky-course]', error);
            section.classList.remove('is-loading', 'is-spinning', 'has-result');
            value.textContent = '科目データを読み込めませんでした';
            department.textContent = '';
            announcement.textContent = '科目データを読み込めませんでした。もう一度お試しください。';
            button.querySelector('span').textContent = '再試行';
        } finally {
            section.setAttribute('aria-busy', 'false');
            button.disabled = false;
            spinning = false;
        }
    }

    button.addEventListener('pointerenter', () => { void getCourseOptions().catch(() => {}); }, { once: true });
    button.addEventListener('focus', () => { void getCourseOptions().catch(() => {}); }, { once: true });
    button.addEventListener('click', tellFortune);
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(fitCourseName, 100);
    });
})();
