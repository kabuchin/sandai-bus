let timeTableData;
let dayScheduleData;
const universityDirection = "産業大学前発";
const stationDirection = "JR住道駅発";
let upcomingBusCount = 5;

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
    if (errorContainer) {
        errorContainer.innerHTML = `
            <div class="error-message">
                <h2>エラーが発生しました</h2>
                <p>${message}</p>
                <p>エラー詳細: ${details}</p>
                <button onclick="window.location.reload()">再読み込み</button>
            </div>
        `;
    } else {
        document.body.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 20px; margin: 20px; background-color: #ffdddd; border-radius: 10px;">
                <h2>エラーが発生しました</h2>
                <p>${message}</p>
                <p>エラー詳細: ${details}</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">再読み込み</button>
            </div>
        `;
    }
}

// 必須DOM要素が存在するか確認する関数
function checkRequiredElements() {
    const requiredIds = [
        'currentTime', 'currentDate', 'scheduleType', 'operationStatus',
        'nextBusTime-university', 'nextBusRemaining-university', 'afterNextBusTime-university', 'afterNextBusRemaining-university',
        'nextBusTime-station', 'nextBusRemaining-station', 'afterNextBusTime-station', 'afterNextBusRemaining-station',
        'upcomingBusList-university', 'upcomingBusList-station'
    ];
    
    const missingElements = requiredIds.filter(id => !document.getElementById(id));
    
    if (missingElements.length > 0) {
        throw new Error(`必要な要素が見つかりません: ${missingElements.join(', ')}`);
    }
    
    return true;
}

// 初期化関数
// 高速初期化関数 - 時刻表表示を最優先
async function fastInit() {
    try {
        // 最小限のDOM要素確認
        const requiredElements = ['currentTime', 'currentDate', 'scheduleType', 'operationStatus'];
        for (const id of requiredElements) {
            if (!document.getElementById(id)) {
                console.warn(`必須要素 ${id} が見つかりません`);
            }
        }
        
        // JSONデータの並列読み込み（最優先）
        const dataPromise = loadTimeTableData();
        
        // 時刻表データ読み込み完了後すぐに表示
        await dataPromise;
        updateDisplay();
        
        // 1分ごとの更新を設定（最適化版）
        setInterval(() => {
            if (!useManualTime) {
                optimizedUpdateDisplay();
            }
        }, 60 * 1000);
        
        // 非必須機能を遅延読み込み
        setTimeout(initSecondaryFeatures, 100);
        
    } catch (error) {
        displayError('時刻データの読み込みに失敗しました。ページを再読み込みしてください。', error.message);
    }
}

// 時刻表データの読み込み（最優先）
async function loadTimeTableData() {
    const [timeResponse, dayResponse] = await Promise.all([
        fetch('time.json'),
        fetch('day.json')
    ]);
    
    if (!timeResponse.ok) {
        throw new Error('time.jsonの取得に失敗しました');
    }
    
    if (!dayResponse.ok) {
        throw new Error('day.jsonの取得に失敗しました');
    }
    
    timeTableData = await timeResponse.json();
    dayScheduleData = await dayResponse.json();
}

// 非必須機能の遅延初期化
function initSecondaryFeatures() {
    try {
        // テーママネージャーを初期化
        ThemeManager.init();
        
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
        
        console.log('二次機能の初期化完了');
    } catch (error) {
        console.warn('二次機能の初期化中にエラーが発生しました:', error);
    }
}

async function init() {
    // 後方互換性のため、fastInitを呼び出し
    return fastInit();
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
        scheduleInfo.timetableId = "1-A";  // 平日臨時増便ダイヤを使用
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
    
    // デフォルトは平日
    scheduleInfo.type = "平日ダイヤ";
    scheduleInfo.timetableId = "1-B";
    return scheduleInfo;
}

// 次と次々のバスを取得
function getNextBuses(direction, hour, minute) {
    const currentDate = getCurrentDateTime();
    const applicableSchedule = getApplicableSchedule(currentDate);
    if (!applicableSchedule.isOperating) {
        return {
            next: null,
            afterNext: null,
            upcomingBuses: []
        };
    }
    
    // 適用すべき時刻表を取得
    const timetable = timeTableData.timetables.find(t => t.id === applicableSchedule.timetableId);
    if (!timetable || !timetable.schedule[direction]) {
        return {
            next: null,
            afterNext: null,
            upcomingBuses: []
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
                    if (upcomingBuses.length >= upcomingBusCount + 2) break;
                }
            }
            if (upcomingBuses.length >= upcomingBusCount + 2) break;
        }
    }
    
    return {
        next: upcomingBuses[0] || null,
        afterNext: upcomingBuses[1] || null,
        upcomingBuses: upcomingBuses.slice(2, upcomingBusCount + 2)
    };
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
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${dayNames[date.getDay()]})`;
}

// 特定の方向のバス情報を更新
function updateDirectionDisplay(direction, directionSuffix, hour, minute, applicableSchedule) {
    try {
        // 次と次々のバスを取得
        const { next, afterNext, upcomingBuses } = getNextBuses(direction, hour, minute);
        
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
                upcomingBusListEl.innerHTML = html;
            } else {
                upcomingBusListEl.innerHTML = '<h3>今後の発車時刻</h3><div class="no-service">この後の便はありません</div>';
            }
        }
    } catch (error) {
        console.error(`${direction}のバス情報更新中にエラーが発生しました:`, error);
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
        
        // 分が変わった場合のみ時刻表示を更新
        if (lastUpdateMinute !== currentMinute) {
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
            updateDirectionDisplay(universityDirection, 'university', hour, minute, applicableSchedule);
            updateDirectionDisplay(stationDirection, 'station', hour, minute, applicableSchedule);
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
        
        // タブの初期状態を画面サイズに応じて設定
        const setInitialTabState = () => {
            const isMobile = window.innerWidth <= 600;
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
            });
        };
        
        // 初期状態を設定
        setInitialTabState();
        
        // クリックイベントを設定
        tabBars.forEach(tab => {
            tab.addEventListener('click', () => {
                const content = tab.nextElementSibling;
                if (content) {
                    content.classList.toggle('closed');
                    tab.classList.toggle('open');
                }
            });
        });
        
        // リサイズ時にも状態を調整
        window.addEventListener('resize', () => {
            setInitialTabState();
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
                dateInput.value = manualDate.toISOString().split('T')[0];
                timeInput.value = manualDate.toTimeString().slice(0, 5);
                currentTimeDisplay.textContent = `設定時刻: ${formatDate(manualDate)} ${formatTime(manualDate.getHours(), manualDate.getMinutes())}`;
                currentTimeDisplay.style.backgroundColor = 'rgba(231, 126, 34, 0.1)';
                currentTimeDisplay.style.borderColor = 'rgba(231, 126, 34, 0.2)';
                currentTimeDisplay.style.color = '#e67e22';
            } else {
                dateInput.value = now.toISOString().split('T')[0];
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
            updateDateTimeDisplay();
            updateModalDisplay();
            updateDisplay();
        });
        
        // 時刻設定ボタン
        setTimeBtn.addEventListener('click', () => {
            const dateValue = dateInput.value;
            const timeValue = timeInput.value;
            
            // 入力値の検証
            const validation = validateDateTime(dateValue, timeValue);
            if (!validation.valid) {
                alert(validation.error);
                return;
            }
            
            useManualTime = true;
            manualDateTime = validation.dateTime.getTime();
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
        return { valid: false, error: '日付は1年前から1年後の範囲で入力してください' };
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

// メモリリークを防ぐためのクリーンアップ関数
function cleanup() {
    // イベントリスナーのクリーンアップ（必要に応じて実装）
    console.log('アプリケーションがクリーンアップされました');
}

// ページを離れる際のクリーンアップ
window.addEventListener('beforeunload', cleanup);

// 要素の読み込み完了を確認してから初期化
// QRCode.jsの読み込み確認（非ブロッキング）
function waitForQRCode() {
    return new Promise((resolve) => {
        if (typeof QRCode !== 'undefined') {
            resolve();
            return;
        }
        
        const checkInterval = setInterval(() => {
            if (typeof QRCode !== 'undefined') {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        // 3秒でタイムアウト（短縮）
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
        }, 3000);
    });
}

function domReadyInit() {
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // 時刻表を即座に初期化
                fastInit();
            });
        } else {
            // DOMが既にロード済みの場合、即座に実行
            fastInit();
        }
    } catch (error) {
        displayError('アプリケーション初期化中にエラーが発生しました', error.message);
    }
}

// スクリプト読み込み時に初期化を開始
domReadyInit();

// Service Worker の登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Service Worker 登録成功:', registration.scope);
                
                // 更新があるかチェック
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 新しいバージョンが利用可能
                            showToast('新しいバージョンが利用可能です。ページを再読み込みしてください。');
                        }
                    });
                });
            })
            .catch((error) => {
                console.log('Service Worker 登録失敗:', error);
            });
    });
}

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

// トースト通知表示
function showToast(message) {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    // スタイルを動的に追加
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #2c3e50;
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: toastSlideIn 0.3s ease-out;
    `;
    
    // アニメーション用CSS
    if (!document.querySelector('#toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            @keyframes toastSlideIn {
                from {
                    transform: translateX(-50%) translateY(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }
            }
            @keyframes toastSlideOut {
                from {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(-50%) translateY(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // 3秒後に自動削除
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'toastSlideOut 0.3s ease-out';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, 3000);
}

// テーマ管理関数
const ThemeManager = {
    // テーマ設定をローカルストレージから読み取り
    init() {
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme) {
            this.setTheme(savedTheme);
        } else {
            // 初回訪問時はシステム設定に従う
            this.setTheme('auto');
        }
        
        this.updateThemeButton();
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
        
        if (!themeButton || !themeText || !themeIcon) return;
        
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

// 初期化時にテーマを適用
ThemeManager.init();
