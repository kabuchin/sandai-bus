let timeTableData;
let dayScheduleData;
const universityDirection = "産業大学前発";
const stationDirection = "JR住道駅発";
let upcomingBusCount = 5;
let upcomingBusCountUniversity = 5; // 産業大学前発用の表示件数
let upcomingBusCountStation = 5; // JR住道駅発用の表示件数
const INITIAL_BUS_COUNT = 5; // 初期表示件数
const INCREMENT_COUNT = 5; // もっと表示ボタンで増やす件数

// 手動設定時刻の管理
let manualDateTime = null;
let useManualTime = false;

// 現在時刻を取得（手動設定時は手動時刻を返す）
function getCurrentDateTime() {
    if (useManualTime && manualDateTime) {
        return new Date(manualDateTime);
    }
    return new Date();
}

// 要素の存在を確認してから値を設定するヘルパー関数
function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    } else {
        console.warn(`要素 ${id} が見つかりません`);
    }
}

// エラー表示関数
function displayError(message, details) {
    console.error(`${message}: ${details}`);

    const errorContainer = document.getElementById('error-container');

    const heading = document.createElement('h2');
    heading.textContent = 'エラーが発生しました';

    const messageEl = document.createElement('p');
    messageEl.textContent = message;

    const detailsEl = document.createElement('p');
    detailsEl.textContent = `エラー詳細: ${details}`;

    const reloadButton = document.createElement('button');
    reloadButton.textContent = '再読み込み';
    reloadButton.addEventListener('click', () => window.location.reload());

    if (errorContainer) {
        const wrapper = document.createElement('div');
        wrapper.className = 'error-message';
        wrapper.appendChild(heading);
        wrapper.appendChild(messageEl);
        wrapper.appendChild(detailsEl);
        wrapper.appendChild(reloadButton);

        errorContainer.innerHTML = '';
        errorContainer.appendChild(wrapper);
    } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'error-message';
        wrapper.style.textAlign = 'center';
        wrapper.style.padding = '20px';
        wrapper.style.margin = '20px';
        wrapper.style.backgroundColor = '#ffdddd';
        wrapper.style.borderRadius = '10px';

        reloadButton.style.padding = '10px 20px';
        reloadButton.style.marginTop = '10px';
        reloadButton.style.backgroundColor = '#3498db';
        reloadButton.style.color = 'white';
        reloadButton.style.border = 'none';
        reloadButton.style.borderRadius = '5px';
        reloadButton.style.cursor = 'pointer';

        wrapper.appendChild(heading);
        wrapper.appendChild(messageEl);
        wrapper.appendChild(detailsEl);
        wrapper.appendChild(reloadButton);

        document.body.innerHTML = '';
        document.body.appendChild(wrapper);
    }
}

// 初期化関数
// 高速初期化関数 - 時刻表表示を最優先
async function fastInit() {
    // 読み込みが長時間かかる場合のフェイルセーフ
    let loadingSettled = false;
    const loadingTimeoutId = setTimeout(() => {
        if (loadingSettled) return;
        loadingSettled = true;
        hideLoadingScreen();
        displayError('読み込みがタイムアウトしました。通信環境を確認してページを再読み込みしてください。', 'timeout');
    }, 15 * 1000);

    try {
        console.log('アプリ初期化開始');
        const initStartTime = performance.now();

        // JSONデータの並列読み込み（最優先）
        await loadTimeTableData();

        if (loadingSettled) {
            // タイムアウト後に遅れて成功した場合は二重描画しない
            return;
        }
        loadingSettled = true;
        clearTimeout(loadingTimeoutId);

        // 時刻表データ読み込み完了後すぐに表示
        updateDisplay();

        // ローディング画面を非表示
        hideLoadingScreen();

        console.log(`初期化完了: ${(performance.now() - initStartTime).toFixed(2)}ms`);

        // 分境界に揃えてから1分ごとの更新を設定（最適化版）
        const now = getCurrentDateTime();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        setTimeout(() => {
            if (!useManualTime) {
                optimizedUpdateDisplay();
            }
            setInterval(() => {
                if (!useManualTime) {
                    optimizedUpdateDisplay();
                }
            }, 60 * 1000);
        }, msUntilNextMinute);

        // 非必須機能を遅延読み込み（マイクロタスクで実行）
        // 注: requestIdleCallback未対応ブラウザではベタ参照がReferenceErrorになるためtypeofで判定
        Promise.resolve().then(() => {
            typeof requestIdleCallback === 'function' ?
                requestIdleCallback(initSecondaryFeatures, { timeout: 2000 }) :
                setTimeout(initSecondaryFeatures, 100);
        });

        // Service Workerの登録と更新チェック（さらに遅延）
        Promise.resolve().then(() => {
            typeof requestIdleCallback === 'function' ?
                requestIdleCallback(setupServiceWorker, { timeout: 3000 }) :
                setTimeout(setupServiceWorker, 200);
        });

    } catch (error) {
        if (loadingSettled) return;
        loadingSettled = true;
        clearTimeout(loadingTimeoutId);
        hideLoadingScreen();
        displayError('時刻データの読み込みに失敗しました。ページを再読み込みしてください。', error.message);
    }
}

// fastInitはindex.htmlから呼ばれるため、ここでは呼び出さない

// ローディング画面を非表示
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 300);
    }
}

// 時刻表データの読み込み（最優先）
async function loadTimeTableData() {
    try {
        // 並列フェッチでパフォーマンス向上
        const [timeResponse, dayResponse] = await Promise.all([
            fetch('time.json', { 
                cache: 'default',
                priority: 'high'
            }),
            fetch('day.json', { 
                cache: 'default',
                priority: 'high'
            })
        ]);
        
        if (!timeResponse.ok) {
            throw new Error(`time.jsonの取得に失敗: ${timeResponse.status}`);
        }
        
        if (!dayResponse.ok) {
            throw new Error(`day.jsonの取得に失敗: ${dayResponse.status}`);
        }
        
        // JSONパースも並列処理
        [timeTableData, dayScheduleData] = await Promise.all([
            timeResponse.json(),
            dayResponse.json()
        ]);
        
        console.log('時刻表データ読み込み完了');
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        throw error;
    }
}

// 非必須機能の遅延初期化
function initSecondaryFeatures() {
    try {
        // QRCode.jsの確認
        if (typeof QRCode === 'undefined') {
            console.warn('QRCode.jsが読み込まれていません。QRコード機能は利用できません。');
        }
        
        // タブバーの設定
        setupTabBars();
        
        // 時刻設定モーダルの設定
        setupTimeModal();
        
        // メニュー機能の設定（QRCode依存）
        setupMenuModal();
        
        // PWAインストール機能の設定
        setupPWAInstall();

        // モーダルのフォーカストラップ
        setupModalFocusTrap();

        console.log('二次機能の初期化完了');
    } catch (error) {
        console.warn('二次機能の初期化中にエラーが発生しました:', error);
    }
}

// 表示中のモーダル内でTabキーによるフォーカスを循環させる
function setupModalFocusTrap() {
    const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        const openModal = document.querySelector('.modal.show');
        if (!openModal) return;

        const focusableElements = Array.from(openModal.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter(el => el.offsetParent !== null);

        if (focusableElements.length === 0) return;

        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    });
}

// 現在の日付に基づいて適用すべき時刻表を取得
function getApplicableSchedule(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${month}-${day}`;
    const dayOfWeek = date.getDay(); // 0: 日曜日, 6: 土曜日
    
    const scheduleInfo = {
        type: '',
        details: '',
        timetableId: '',
        isOperating: true
    };
    
    // 日付から運行情報を判断
    const { schedule_summary } = dayScheduleData;
    
    // 無料乗車日のチェック
    const freeRideDates = schedule_summary.free_ride.dates[year] || [];
    if (freeRideDates.includes(dateString)) {
        scheduleInfo.type = schedule_summary.free_ride.description;
        scheduleInfo.timetableId = "1-B";  // 臨時増便ダイヤを使用
        return scheduleInfo;
    }
    
    // 休み（運休）のチェック
    const noServiceDates = schedule_summary.no_service.specific_dates[year] || [];
    if (noServiceDates.includes(dateString) || (dayOfWeek === 0 && !freeRideDates.includes(dateString))) {
        scheduleInfo.type = schedule_summary.no_service.description;
        scheduleInfo.isOperating = false;
        return scheduleInfo;
    }
    
    // 夏季限定ダイヤのチェック
    const summerScheduleDates = schedule_summary.summer_limited_schedule.dates[year] || [];
    if (summerScheduleDates.includes(dateString)) {
        scheduleInfo.type = schedule_summary.summer_limited_schedule.description;
        scheduleInfo.timetableId = "3";
        return scheduleInfo;
    }
    
    // 土曜日の場合
    if (dayOfWeek === 6) {
        scheduleInfo.type = "土曜ダイヤ";
        scheduleInfo.timetableId = "2";
        return scheduleInfo;
    }

    // 平日特別ダイヤ期間のチェック（4/2〜5/1・9/24〜10/2 など、day.jsonで年別に定義）
    const specialWeekday = schedule_summary.weekday_special_schedule;
    const specialRanges = (specialWeekday && specialWeekday.ranges && specialWeekday.ranges[year]) || [];
    const isSpecialWeekday = specialRanges.some(
        (range) => range.start <= dateString && dateString <= range.end
    );
    if (isSpecialWeekday) {
        scheduleInfo.type = specialWeekday.description || "平日特別ダイヤ";
        scheduleInfo.timetableId = specialWeekday.timetable_id || "1-B";
        return scheduleInfo;
    }

    // デフォルトは平日
    scheduleInfo.type = "平日ダイヤ";
    scheduleInfo.timetableId = "1-A";
    return scheduleInfo;
}

// 次と次々のバスを取得
function getNextBuses(direction, hour, minute, displayCount = upcomingBusCount) {
    const currentDate = getCurrentDateTime();
    const applicableSchedule = getApplicableSchedule(currentDate);
    if (!applicableSchedule.isOperating) {
        return {
            next: null,
            afterNext: null,
            upcomingBuses: [],
            totalAvailable: 0
        };
    }
    
    // 適用すべき時刻表を取得
    const timetable = timeTableData.timetables.find(t => t.id === applicableSchedule.timetableId);
    if (!timetable || !timetable.schedule[direction]) {
        return {
            next: null,
            afterNext: null,
            upcomingBuses: [],
            totalAvailable: 0
        };
    }
    
    const scheduleForDirection = timetable.schedule[direction];
    const upcomingBuses = [];
    
    // 今日の残りの時間帯で全てのバスを取得
    for (let h = hour; h <= 23; h++) {
        if (scheduleForDirection[h]) {
            const minutesForHour = scheduleForDirection[h];
            for (const m of minutesForHour) {
                if (h > hour || (h === hour && m >= minute)) {
                    upcomingBuses.push({ hour: h, minute: m });
                }
            }
        }
    }
    
    // 明日の時刻表も確認（深夜バス対応）
    if (upcomingBuses.length < 2) {
        for (let h = 0; h <= 6; h++) {
            if (scheduleForDirection[h]) {
                const minutesForHour = scheduleForDirection[h];
                for (const m of minutesForHour) {
                    upcomingBuses.push({ 
                        hour: h, 
                        minute: m, 
                        isNextDay: true 
                    });
                    if (upcomingBuses.length >= displayCount + 2) break;
                }
            }
            if (upcomingBuses.length >= displayCount + 2) break;
        }
    }
    
    const totalAvailable = upcomingBuses.length - 2; // 次と次々のバスを除いた残り
    
    return {
        next: upcomingBuses[0] || null,
        afterNext: upcomingBuses[1] || null,
        upcomingBuses: upcomingBuses.slice(2, displayCount + 2),
        totalAvailable: totalAvailable
    };
}

// 翌日の始発バスを取得（本日の運行が終了した場合の案内用）
function getTomorrowFirstBus(direction) {
    const tomorrow = new Date(getCurrentDateTime());
    tomorrow.setDate(tomorrow.getDate() + 1);

    const applicableSchedule = getApplicableSchedule(tomorrow);
    if (!applicableSchedule.isOperating) {
        return null;
    }

    const timetable = timeTableData.timetables.find(t => t.id === applicableSchedule.timetableId);
    if (!timetable || !timetable.schedule[direction]) {
        return null;
    }

    const scheduleForDirection = timetable.schedule[direction];
    for (let h = 0; h <= 23; h++) {
        const minutesForHour = scheduleForDirection[h];
        if (minutesForHour && minutesForHour.length > 0) {
            return { hour: h, minute: minutesForHour[0], scheduleType: applicableSchedule.type };
        }
    }

    return null;
}

// 残り時間を計算
function calculateRemainingTime(hour, minute, isNextDay = false) {
    const now = getCurrentDateTime();
    const busTime = new Date(now);
    
    busTime.setHours(hour, minute, 0, 0);
    if (isNextDay) {
        busTime.setDate(busTime.getDate() + 1);
    }
    
    const diffMs = busTime - now;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
        return `あと${diffMinutes}分`;
    } else {
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        return `あと${hours}時間${minutes}分`;
    }
}

// 時刻をフォーマット
function formatTime(hour, minute) {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// 日付をフォーマット
function formatDate(date) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}月${date.getDate()}日(${dayNames[date.getDay()]})`;
}

// input[type="date"]用にローカル日付をフォーマット（toISOStringはUTC基準のため使わない）
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 特定の方向のバス情報を更新
function updateDirectionDisplay(direction, directionSuffix, hour, minute, applicableSchedule) {
    try {
        // 表示件数を取得
        const displayCount = directionSuffix === 'university' ? upcomingBusCountUniversity : upcomingBusCountStation;
        
        // 次と次々のバスを取得
        const { next, afterNext, upcomingBuses, totalAvailable } = getNextBuses(direction, hour, minute, displayCount);
        
        // 次のバス表示
        if (next) {
            setElementText(`nextBusTime-${directionSuffix}`, formatTime(next.hour, next.minute));
            setElementText(`nextBusRemaining-${directionSuffix}`, calculateRemainingTime(next.hour, next.minute, next.isNextDay));
        } else {
            setElementText(`nextBusTime-${directionSuffix}`, '-- : --');
            setElementText(`nextBusRemaining-${directionSuffix}`, '本日の運行は終了しました');
        }
        
        // 次々のバス表示
        if (afterNext) {
            setElementText(`afterNextBusTime-${directionSuffix}`, formatTime(afterNext.hour, afterNext.minute));
            setElementText(`afterNextBusRemaining-${directionSuffix}`, calculateRemainingTime(afterNext.hour, afterNext.minute, afterNext.isNextDay));
        } else {
            setElementText(`afterNextBusTime-${directionSuffix}`, '-- : --');
            setElementText(`afterNextBusRemaining-${directionSuffix}`, '本日の運行は終了しました');
        }
        
        // 今後のバス時刻リスト表示
        const upcomingBusListEl = document.getElementById(`upcomingBusList-${directionSuffix}`);

        if (upcomingBusListEl) {
            // 書き換え前にスクロール位置を保存し、後で復元する
            const previousScrollTop = upcomingBusListEl.scrollTop;

            if (upcomingBuses.length > 0) {
                let html = '<h3>今後の発車時刻</h3><ul class="bus-list">';
                upcomingBuses.forEach(bus => {
                    html += `
                        <li class="bus-list-item">
                            <span class="bus-time">${formatTime(bus.hour, bus.minute)}</span>
                            <span class="bus-remaining">${calculateRemainingTime(bus.hour, bus.minute, bus.isNextDay)}</span>
                        </li>
                    `;
                });
                html += '</ul>';

                // もっと表示ボタンをタブ内に追加
                if (totalAvailable > displayCount) {
                    const remaining = totalAvailable - displayCount;
                    let buttonText = 'もっと表示';
                    // 残りが10件未満の場合のみ件数を表示
                    if (remaining < 10) {
                        buttonText = `もっと表示 (残り${remaining}件)`;
                    }
                    html += `<button class="show-more-btn" id="showMoreBtn-${directionSuffix}">${buttonText}</button>`;
                }

                upcomingBusListEl.innerHTML = html;

                // ボタンのイベントリスナーを再設定
                const showMoreBtn = document.getElementById(`showMoreBtn-${directionSuffix}`);
                if (showMoreBtn) {
                    showMoreBtn.addEventListener('click', () => {
                        if (directionSuffix === 'university') {
                            upcomingBusCountUniversity += INCREMENT_COUNT;
                        } else {
                            upcomingBusCountStation += INCREMENT_COUNT;
                        }
                        updateDisplay();
                    });
                }
            } else if (next === null) {
                // 本日の残り便が無い場合は終バス案内＋翌日の始発情報を表示
                let html = '<h3>今後の発車時刻</h3><div class="no-service">本日の運行は終了しました</div>';
                const tomorrowFirstBus = getTomorrowFirstBus(direction);
                if (tomorrowFirstBus) {
                    html += `<div class="next-day-info">明日の始発: ${formatTime(tomorrowFirstBus.hour, tomorrowFirstBus.minute)}</div>`;
                } else {
                    html += '<div class="next-day-info">明日は運休日です</div>';
                }
                upcomingBusListEl.innerHTML = html;
            } else {
                upcomingBusListEl.innerHTML = '<h3>今後の発車時刻</h3><div class="no-service">この後の便はありません</div>';
            }

            // スクロール位置を復元
            upcomingBusListEl.scrollTop = previousScrollTop;
        }

        // 本日の残り便があるかどうかを返す
        return next !== null;
    } catch (error) {
        console.error(`${direction}のバス情報更新中にエラーが発生しました:`, error);
        return true;
    }
}

// 全体の表示を更新
// 前回の更新時刻をキャッシュして不要な更新を防ぐ
let lastUpdateMinute = -1;
let lastScheduleType = '';

function updateDisplay() {
    try {
        if (!timeTableData || !dayScheduleData) {
            console.error('時刻表データが読み込まれていません');
            return;
        }
        
        const now = getCurrentDateTime();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const currentMinute = hour * 60 + minute;
        
        // 手動時刻設定時、または分が変わった場合に時刻表示を更新
        if (useManualTime || lastUpdateMinute !== currentMinute) {
            setElementText('currentTime', formatTime(hour, minute));
            setElementText('currentDate', formatDate(now));
            updateDateTimeDisplay();
            lastUpdateMinute = currentMinute;
        }
        
        // 適用中のダイヤ種別を取得
        const applicableSchedule = getApplicableSchedule(now);
        
        // スケジュールタイプが変わった場合のみ更新
        if (lastScheduleType !== applicableSchedule.type) {
            setElementText('scheduleType', applicableSchedule.type);
            updateOperationStatus(applicableSchedule);
            lastScheduleType = applicableSchedule.type;
        }
        
        // 運行中の場合のみバス情報を更新
        if (applicableSchedule.isOperating) {
            const hasUniv = updateDirectionDisplay(universityDirection, 'university', hour, minute, applicableSchedule);
            const hasStation = updateDirectionDisplay(stationDirection, 'station', hour, minute, applicableSchedule);
            updateEndOfServiceStatus(hasUniv, hasStation);
        }
    } catch (error) {
        displayError('表示の更新中にエラーが発生しました', error.message);
    }
}

// 運行状況表示を分離して効率化
function updateOperationStatus(applicableSchedule) {
    const operationStatusEl = document.getElementById('operationStatus');
    if (!operationStatusEl) return;
    
    if (!applicableSchedule.isOperating) {
        operationStatusEl.textContent = '本日運休';
        operationStatusEl.classList.add('danger');
        
        // 運休時は両方向の時刻表示をクリア
        clearAllBusDisplays();
    } else {
        operationStatusEl.textContent = '運行中';
        operationStatusEl.classList.remove('danger');
    }
}

// 本日の残り便の有無に応じて運行状況表示を更新（毎回の更新で呼び出される）
function updateEndOfServiceStatus(hasUniv, hasStation) {
    const operationStatusEl = document.getElementById('operationStatus');
    if (!operationStatusEl) return;

    if (!hasUniv && !hasStation) {
        operationStatusEl.textContent = '本日の運行終了';
        operationStatusEl.classList.add('warning');
        operationStatusEl.classList.remove('danger');
    } else {
        operationStatusEl.textContent = '運行中';
        operationStatusEl.classList.remove('warning');
        operationStatusEl.classList.remove('danger');
    }
}

// 運休時の表示クリア処理を分離
function clearAllBusDisplays() {
    const universityList = document.getElementById('upcomingBusList-university');
    const stationList = document.getElementById('upcomingBusList-station');
    
    if (universityList) universityList.innerHTML = '<div class="no-service">本日のバスの運行はありません</div>';
    if (stationList) stationList.innerHTML = '<div class="no-service">本日のバスの運行はありません</div>';
    
    ['university', 'station'].forEach(directionSuffix => {
        setElementText(`nextBusTime-${directionSuffix}`, '-- : --');
        setElementText(`nextBusRemaining-${directionSuffix}`, '運休');
        setElementText(`afterNextBusTime-${directionSuffix}`, '-- : --');
        setElementText(`afterNextBusRemaining-${directionSuffix}`, '運休');
    });
}

// タブバーの開閉機能を設定
function setupTabBars() {
    try {
        // タブバーの開閉機能
        const tabBars = document.querySelectorAll('.tab-bar');

        const MOBILE_BREAKPOINT = 600;
        let wasMobile = window.innerWidth <= MOBILE_BREAKPOINT;

        // aria-expandedを開閉状態に同期
        const syncAriaExpanded = (tab, content) => {
            tab.setAttribute('aria-expanded', content ? String(!content.classList.contains('closed')) : 'false');
        };

        // タブの初期状態を画面サイズに応じて設定
        const setInitialTabState = () => {
            const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
            tabBars.forEach(tab => {
                const content = tab.nextElementSibling;
                if (content) {
                    if (isMobile) {
                        // モバイルでは閉じた状態で開始
                        content.classList.add('closed');
                        tab.classList.remove('open');
                    } else {
                        // デスクトップでは開いた状態で開始
                        content.classList.remove('closed');
                        tab.classList.add('open');
                    }
                }
                syncAriaExpanded(tab, content);
            });
        };

        // キーボードアクセシビリティ用の属性を設定
        tabBars.forEach(tab => {
            tab.setAttribute('role', 'button');
            tab.setAttribute('tabindex', '0');
        });

        // 初期状態を設定
        setInitialTabState();

        // 開閉処理を共通化
        const toggleTab = (tab) => {
            const content = tab.nextElementSibling;
            if (content) {
                content.classList.toggle('closed');
                tab.classList.toggle('open');
            }
            syncAriaExpanded(tab, content);
        };

        // クリックイベントを設定
        tabBars.forEach(tab => {
            tab.addEventListener('click', () => {
                toggleTab(tab);
            });

            // キーボードアクセシビリティ（Enter/Space）
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleTab(tab);
                }
            });
        });

        // リサイズ時はブレークポイントをまたいだ場合のみ状態をリセット
        // （モバイルブラウザのURLバー表示/非表示によるresizeで開いたタブが閉じるのを防ぐ）
        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
            if (isMobile !== wasMobile) {
                wasMobile = isMobile;
                setInitialTabState();
            }
        });
    } catch (error) {
        console.error('タブバーの設定中にエラーが発生しました:', error);
    }
}

// 時刻設定モーダルのセットアップ
function setupTimeModal() {
    try {
        const dateTimeInfoEl = document.getElementById('dateTimeInfo');
        const modal = document.getElementById('timeModal');
        const closeModal = document.getElementById('closeModal');
        const dateInput = document.getElementById('dateInput');
        const timeInput = document.getElementById('timeInput');
        const currentTimeDisplay = document.getElementById('currentTimeDisplay');
        const useCurrentTimeBtn = document.getElementById('useCurrentTime');
        const setTimeBtn = document.getElementById('setTime');
        
        if (!dateTimeInfoEl || !modal) {
            console.warn('時刻設定モーダルの要素が見つかりません');
            return;
        }
        
        // 日時エリア全体をクリックしてモーダルを開く
        dateTimeInfoEl.addEventListener('click', openModal);
        
        // キーボードアクセシビリティ
        dateTimeInfoEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal();
            }
        });
        
        // 閉じるボタンのキーボードアクセシビリティ
        closeModal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeModalFn();
            }
        });
        
        function openModal() {
            updateModalDisplay();
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            // フォーカス管理
            dateInput.focus();
        }
        
        function updateModalDisplay() {
            const now = new Date();
            
            if (useManualTime && manualDateTime) {
                const manualDate = new Date(manualDateTime);
                dateInput.value = formatDateForInput(manualDate);
                timeInput.value = manualDate.toTimeString().slice(0, 5);
                currentTimeDisplay.textContent = `設定時刻: ${formatDate(manualDate)} ${formatTime(manualDate.getHours(), manualDate.getMinutes())}`;
                currentTimeDisplay.style.backgroundColor = 'rgba(231, 126, 34, 0.1)';
                currentTimeDisplay.style.borderColor = 'rgba(231, 126, 34, 0.2)';
                currentTimeDisplay.style.color = '#e67e22';
            } else {
                dateInput.value = formatDateForInput(now);
                timeInput.value = now.toTimeString().slice(0, 5);
                currentTimeDisplay.textContent = '現在時刻で表示中';
                currentTimeDisplay.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
                currentTimeDisplay.style.borderColor = 'rgba(52, 152, 219, 0.2)';
                currentTimeDisplay.style.color = 'var(--primary-color)';
            }
        }
        
        // モーダルを閉じる
        function closeModalFn() {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            // フォーカスを元の要素に戻す
            dateTimeInfoEl.focus();
        }
        
        closeModal.addEventListener('click', closeModalFn);
        
        // モーダル背景をクリックして閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModalFn();
            }
        });
        
        // 入力値の変更を監視（debounce適用）
        const debouncedUpdatePreview = debounce(updatePreview, 300);
        [dateInput, timeInput].forEach(input => {
            input.addEventListener('input', debouncedUpdatePreview);
        });
        
        function updatePreview() {
            const dateValue = dateInput.value;
            const timeValue = timeInput.value;
            
            if (dateValue && timeValue) {
                const selectedDateTime = new Date(`${dateValue}T${timeValue}`);
                currentTimeDisplay.textContent = `プレビュー: ${formatDate(selectedDateTime)} ${formatTime(selectedDateTime.getHours(), selectedDateTime.getMinutes())}`;
                currentTimeDisplay.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
                currentTimeDisplay.style.borderColor = 'rgba(46, 204, 113, 0.2)';
                currentTimeDisplay.style.color = '#27ae60';
            }
        }
        
        // 現在時刻に戻すボタン
        useCurrentTimeBtn.addEventListener('click', () => {
            useManualTime = false;
            manualDateTime = null;
            lastUpdateMinute = -1; // キャッシュをリセット
            lastScheduleType = ''; // スケジュールタイプもリセット
            updateDateTimeDisplay();
            updateModalDisplay();
            updateDisplay();
            closeModalFn(); // モーダルを閉じる
        });
        
        // 時刻設定ボタン
        setTimeBtn.addEventListener('click', () => {
            const dateValue = dateInput.value;
            const timeValue = timeInput.value;
            
            // 入力値の検証
            const validation = validateDateTime(dateValue, timeValue);
            if (!validation.valid) {
                showToast(validation.error, 'error');
                return;
            }
            
            useManualTime = true;
            manualDateTime = validation.dateTime.getTime();
            lastUpdateMinute = -1; // キャッシュをリセット
            lastScheduleType = ''; // スケジュールタイプもリセット
            updateDateTimeDisplay();
            closeModalFn();
            updateDisplay();
        });
        
        // Escキーでモーダルを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                closeModalFn();
            }
        });
        
    } catch (error) {
        console.error('時刻設定モーダルのセットアップ中にエラーが発生しました:', error);
    }
}

// 日時表示の見た目を更新
function updateDateTimeDisplay() {
    const dateTimeInfoEl = document.getElementById('dateTimeInfo');
    if (dateTimeInfoEl) {
        if (useManualTime) {
            dateTimeInfoEl.classList.add('manual');
        } else {
            dateTimeInfoEl.classList.remove('manual');
        }
    }
}

// 入力値の検証を追加
function validateDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) {
        return { valid: false, error: '日付と時刻を入力してください' };
    }
    
    const dateTime = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(dateTime.getTime())) {
        return { valid: false, error: '有効な日付と時刻を入力してください' };
    }
    
    const now = new Date();
    const maxDate = new Date(now.getFullYear() + 1, 11, 31); // 来年末まで
    const minDate = new Date(now.getFullYear() - 1, 0, 1);   // 去年始めから
    
    if (dateTime > maxDate || dateTime < minDate) {
        return { valid: false, error: '日付は昨年から来年末までの範囲で入力してください' };
    }
    
    return { valid: true, dateTime };
}

// パフォーマンス改善のためのdebounce関数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// パフォーマンス最適化のためのRAF（RequestAnimationFrame）デバウンス
function rafDebounce(fn) {
    let rafId = null;
    return function (...args) {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            fn.apply(this, args);
            rafId = null;
        });
    };
}

// 最適化されたDOM更新
const optimizedUpdateDisplay = rafDebounce(updateDisplay);

// domReadyInit関数は削除（index.htmlから直接fastInitが呼ばれる）

// Service Workerの登録はsetupServiceWorker()に一本化（二重登録・更新フローの競合を防ぐ）

// メニュー機能のセットアップ
function setupMenuModal() {
    try {
        const menuButton = document.getElementById('menuButton');
        const menuModal = document.getElementById('menuModal');
        const qrModal = document.getElementById('qrModal');
        const closeMenuModal = document.getElementById('closeMenuModal');
        const closeQRModal = document.getElementById('closeQRModal');
        const shareUrlBtn = document.getElementById('shareUrl');
        const showQRBtn = document.getElementById('showQR');
        const shareNativeBtn = document.getElementById('shareNative');
        const downloadQRBtn = document.getElementById('downloadQR');
        const qrCanvas = document.getElementById('qrCanvas');
        const themeToggle = document.getElementById('themeToggle');
        
        if (!menuButton || !menuModal || !qrModal) {
            console.warn('メニュー機能の要素が見つかりません');
            return;
        }
        
        // テーマ切り替えボタンのイベントリスナー
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                ThemeManager.toggleTheme();
            });
            // ボタンの表示を初期化
            ThemeManager.updateThemeButton();
        }
        
        // Web Share API対応チェック
        if ('share' in navigator) {
            shareNativeBtn.style.display = 'block';
        }
        
        // メニューボタンクリック
        menuButton.addEventListener('click', () => {
            menuModal.classList.add('show');
            menuModal.setAttribute('aria-hidden', 'false');
        });
        
        // モーダルを閉じる機能
        function closeMenuModalFn() {
            menuModal.classList.remove('show');
            menuModal.setAttribute('aria-hidden', 'true');
        }
        
        function closeQRModalFn() {
            qrModal.classList.remove('show');
            qrModal.setAttribute('aria-hidden', 'true');
        }
        
        closeMenuModal.addEventListener('click', closeMenuModalFn);
        closeQRModal.addEventListener('click', closeQRModalFn);
        
        // モーダル外クリックで閉じる
        [menuModal, qrModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (modal === menuModal) closeMenuModalFn();
                    if (modal === qrModal) closeQRModalFn();
                }
            });
        });
        
        // URLコピー機能
        shareUrlBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                showToast('URLをクリップボードにコピーしました！');
                closeMenuModalFn();
            } catch (err) {
                // フォールバック
                const textArea = document.createElement('textarea');
                textArea.value = window.location.href;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('URLをコピーしました！');
                closeMenuModalFn();
            }
        });
        
        // QRコード表示
        showQRBtn.addEventListener('click', async () => {
            try {
                // QRCode.jsが読み込まれているかチェック
                if (typeof QRCode === 'undefined') {
                    console.warn('QRCode.jsが利用できないため、フォールバックを使用します');
                }
                
                await generateQRCode(window.location.href);
                closeMenuModalFn();
                qrModal.classList.add('show');
                qrModal.setAttribute('aria-hidden', 'false');
            } catch (err) {
                console.error('QRコード生成エラー:', err);
                showToast(`QRコードの生成に失敗しました: ${err.message}`);
            }
        });
        
        // ネイティブ共有
        if (shareNativeBtn) {
            shareNativeBtn.addEventListener('click', async () => {
                try {
                    await navigator.share({
                        title: '産大バス時刻表',
                        text: '大阪産業大学のスクールバス時刻表をチェック！',
                        url: window.location.href
                    });
                    closeMenuModalFn();
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('共有エラー:', err);
                        showToast('共有に失敗しました');
                    }
                }
            });
        }
        
        // QRコードダウンロード
        downloadQRBtn.addEventListener('click', () => {
            try {
                const link = document.createElement('a');
                link.download = '産大バス時刻表_QRコード.png';
                link.href = qrCanvas.toDataURL();
                link.click();
                showToast('QRコードをダウンロードしました！');
            } catch (err) {
                console.error('ダウンロードエラー:', err);
                showToast('ダウンロードに失敗しました');
            }
        });
        
        // キーボードアクセシビリティ
        [closeMenuModal, closeQRModal].forEach(closeBtn => {
            closeBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    closeBtn.click();
                }
            });
        });
        
        // Escキーでモーダルを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (menuModal.classList.contains('show')) closeMenuModalFn();
                if (qrModal.classList.contains('show')) closeQRModalFn();
            }
        });
        
    } catch (error) {
        console.error('メニュー機能のセットアップ中にエラーが発生しました:', error);
    }
}

// QRコード生成
async function generateQRCode(url) {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas) throw new Error('QRCanvas not found');
    
    // QRCode.jsが利用可能かチェック
    if (typeof QRCode === 'undefined') {
        console.warn('QRCodeライブラリが利用できません、フォールバックを使用');
        // フォールバック: QR Server API を使用
        try {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=2c3e50`;
            
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = () => {
                    try {
                        const ctx = canvas.getContext('2d');
                        canvas.width = 256;
                        canvas.height = 256;
                        
                        // 背景を白で塗りつぶし
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, 256, 256);
                        
                        // QRコードを描画
                        ctx.drawImage(img, 0, 0, 256, 256);
                        
                        console.log('フォールバックQRコード生成成功');
                        resolve();
                    } catch (drawError) {
                        console.error('Canvas描画エラー:', drawError);
                        reject(drawError);
                    }
                };
                
                img.onerror = (error) => {
                    console.error('QRコードAPI読み込みエラー:', error);
                    reject(new Error('QRコードAPIからの読み込みに失敗しました'));
                };
                
                img.src = qrUrl;
            });
        } catch (fallbackError) {
            console.error('フォールバックQRコード生成エラー:', fallbackError);
            throw new Error('QRコードの生成に失敗しました（ライブラリとAPIの両方が利用できません）');
        }
    }
    
    try {
        await QRCode.toCanvas(canvas, url, {
            width: 256,
            margin: 2,
            color: {
                dark: '#2c3e50',
                light: '#ffffff'
            },
            errorCorrectionLevel: 'M'
        });
        console.log('QRコード生成成功（QRCode.js使用）');
    } catch (error) {
        console.error('QRCode.js使用時エラー:', error);
        throw error;
    }
}

// テーマ管理関数
const ThemeManager = {
    currentTheme: 'auto', // デフォルト値を設定
    
    // テーマ設定をローカルストレージから読み取り
    init() {
        const savedTheme = localStorage.getItem('theme') || 'auto';
        this.currentTheme = savedTheme; // currentThemeを先に設定
        this.setTheme(savedTheme);
        
        // updateThemeButtonは後で呼ばれる（setupMenuModal内）
    },
    
    // テーマを設定
    setTheme(theme) {
        const root = document.documentElement;
        
        switch (theme) {
            case 'light':
                root.setAttribute('data-theme', 'light');
                break;
            case 'dark':
                root.setAttribute('data-theme', 'dark');
                break;
            case 'auto':
            default:
                root.removeAttribute('data-theme');
                break;
        }
        
        localStorage.setItem('theme', theme);
        this.currentTheme = theme;
    },
    
    // 次のテーマに切り替え
    toggleTheme() {
        const themes = ['auto', 'light', 'dark'];
        const currentIndex = themes.indexOf(this.currentTheme || 'auto');
        const nextIndex = (currentIndex + 1) % themes.length;
        const nextTheme = themes[nextIndex];
        
        this.setTheme(nextTheme);
        this.updateThemeButton();
        
        // フィードバック用トースト表示
        const themeNames = {
            'auto': 'システム設定',
            'light': 'ライトモード',
            'dark': 'ダークモード'
        };
        showToast(`テーマを${themeNames[nextTheme]}に変更しました`);
    },
    
    // テーマボタンの表示を更新
    updateThemeButton() {
        const themeButton = document.getElementById('themeToggle');
        const themeText = document.getElementById('themeText');
        const themeIcon = themeButton?.querySelector('.theme-icon');
        
        if (!themeButton || !themeText || !themeIcon) {
            return;
        }
        
        const currentTheme = this.currentTheme || 'auto';
        
        const themeConfig = {
            'auto': {
                text: 'システム設定',
                icon: `<path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"></path>`
            },
            'light': {
                text: 'ライトモード',
                icon: `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`
            },
            'dark': {
                text: 'ダークモード',
                icon: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`
            }
        };
        
        const config = themeConfig[currentTheme];
        themeText.textContent = config.text;
        themeIcon.innerHTML = config.icon;
    }
};

// PWAインストール機能
let deferredPrompt = null;

function setupPWAInstall() {
    const installBanner = document.getElementById('installBanner');
    const installButton = document.getElementById('installButton');
    const dismissInstallBannerBtn = document.getElementById('dismissInstallBanner');

    // 既にインストール済みかチェック
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        localStorage.getItem('pwa-installed') === 'true') {
        console.log('既にPWAとしてインストール済みです');
        if (installBanner) {
            installBanner.classList.add('installed');
        }
        return;
    }

    // 7日以内に閉じられていれば再表示しない
    const dismissedAt = localStorage.getItem('installBannerDismissedAt');
    if (dismissedAt) {
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - Number(dismissedAt) < SEVEN_DAYS_MS) {
            if (installBanner) {
                installBanner.classList.add('installed');
            }
            return;
        }
    }

    // バナーを閉じるボタン
    if (dismissInstallBannerBtn) {
        dismissInstallBannerBtn.addEventListener('click', () => {
            if (installBanner) {
                installBanner.classList.add('installed');
            }
            localStorage.setItem('installBannerDismissedAt', String(Date.now()));
        });
    }

    // beforeinstallpromptイベントをキャプチャ
    window.addEventListener('beforeinstallprompt', (e) => {
        // デフォルトのインストールプロンプトを防ぐ
        e.preventDefault();
        deferredPrompt = e;
        console.log('インストールプロンプトが利用可能です');
    });
    
    // インストールボタンのクリックイベント
    if (installButton) {
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) {
                // iOSの場合のヘルプメッセージ
                if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    showIOSInstallGuide();
                } else {
                    showToast('インストールは現在利用できません。ブラウザの設定からインストールしてください。', 'info');
                }
                return;
            }
            
            // インストールプロンプトを表示
            deferredPrompt.prompt();
            
            // ユーザーの選択を待つ
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('ユーザーがPWAのインストールを承認しました');
                showToast('アプリをインストール中...', 'success');
            } else {
                console.log('ユーザーがPWAのインストールを拒否しました');
            }
            
            // プロンプトは一度しか使えない
            deferredPrompt = null;
        });
    }
    
    // インストール成功時のイベント
    window.addEventListener('appinstalled', () => {
        console.log('PWAが正常にインストールされました');
        if (installBanner) {
            installBanner.classList.add('installed');
        }
        showToast('アプリをインストールしました！', 'success');
        
        // インストール済みフラグを保存
        localStorage.setItem('pwa-installed', 'true');
    });
}

function showIOSInstallGuide() {
    showToast('Safari の共有ボタンから「ホーム画面に追加」を選択してください', 'info');
}

// トースト通知を表示（既存のshowToast関数がない場合）
function showToast(message, type = 'info') {
    // 既存のトースト要素を削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // トースト要素を作成
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    // bodyに追加
    document.body.appendChild(toast);
    
    // フェードイン
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // 3秒後にフェードアウト
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Service Workerの登録と更新通知
function setupServiceWorker() {
    // オンライン/オフライン状態の監視（SW非対応環境でも動作させる）
    window.addEventListener('online', () => {
        showToast('オンラインに戻りました', 'success');
    });

    window.addEventListener('offline', () => {
        showToast('オフラインモードです', 'warning');
    });

    // 読み込み時点で既にオフラインの場合も通知
    if (navigator.onLine === false) {
        showToast('オフラインモードです', 'warning');
    }

    if (!('serviceWorker' in navigator)) {
        return;
    }

    // この時点でコントローラーが無い場合は初回訪問。
    // 初回のclients.claim()によるcontrollerchangeでリロードしないためのフラグ
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;

    navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
            console.log('Service Worker登録成功:', registration.scope);

            // 更新チェック
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('新しいService Workerが見つかりました');

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // 新しいバージョンが利用可能 - 自動更新
                        console.log('新しいバージョンを自動適用します');
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // 定期的に更新チェック（1時間ごと）
            setInterval(() => {
                registration.update();
            }, 60 * 60 * 1000);
        })
        .catch((error) => {
            console.error('Service Worker登録失敗:', error);
        });

    // コントローラーの変更を監視（新しいSWがアクティブになった時）
    // 初回インストール時はリロードせず、更新時も1回だけリロードする
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || refreshing) {
            return;
        }
        refreshing = true;
        console.log('Service Workerが更新されました。ページをリロードします。');
        window.location.reload();
    });
}

// 初期化時にテーマを適用
ThemeManager.init();

